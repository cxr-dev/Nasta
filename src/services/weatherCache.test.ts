import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWeatherForStation, getDailySummary, clearWeatherCache } from './weatherCache';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const STOCKHOLM_LAT = 59.329;
const STOCKHOLM_LON = 18.068;

function mockResponse(currentCode: number, currentTemp: number, dailyCode: number, tempMin: number, tempMax: number) {
  return {
    ok: true,
    json: () => Promise.resolve({
      current: { weather_code: currentCode, temperature_2m: currentTemp },
      daily: {
        weather_code: [dailyCode],
        temperature_2m_max: [tempMax],
        temperature_2m_min: [tempMin],
      },
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  clearWeatherCache();
});

describe('getWeatherForStation', () => {
  it('returns rain when current code is rain (61)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(61, 15, 0, 12, 18));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBe('rain');
  });

  it('returns snow when current code is snow (71)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(71, -2, 0, -5, 0));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBe('snow');
  });

  it('returns thunder when current code is thunder (95)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(95, 22, 0, 18, 26));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBe('thunder');
  });

  it('returns null when current is clear but daily shows rain', async () => {
    // Current: clear (0). Daily worst: rain (61). Should return null (not rain).
    mockFetch.mockResolvedValueOnce(mockResponse(0, 15, 61, 12, 18));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBeNull();
  });

  it('returns null for clear weather (code=0)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(0, 20, 0, 15, 25));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBeNull();
  });

  it('returns null for overcast weather (code=3)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(3, 10, 3, 8, 12));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(result).toBeNull();
  });

  it('caches and reuses result within TTL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(65, 14, 65, 11, 16));
    const r1 = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(r1).toBe('rain');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const r2 = await getWeatherForStation(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(r2).toBe('rain');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getDailySummary', () => {
  it('returns precipitation symbol and temperature range', async () => {
    // Thunder in daily summary
    mockFetch.mockResolvedValueOnce(mockResponse(3, 18, 95, 12, 28));
    const summary = await getDailySummary(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(summary.symbol).toBe('thunder');
    expect(summary.tempMin).toBe(12);
    expect(summary.tempMax).toBe(28);
  });

  it('returns null symbol on clear day', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(0, 15, 0, 10, 20));
    const summary = await getDailySummary(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(summary.symbol).toBeNull();
    expect(summary.tempMin).toBe(10);
    expect(summary.tempMax).toBe(20);
  });

  it('returns null on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    const summary = await getDailySummary(STOCKHOLM_LAT, STOCKHOLM_LON);
    expect(summary.symbol).toBeNull();
    expect(summary.tempMin).toBeNull();
    expect(summary.tempMax).toBeNull();
  });
});
