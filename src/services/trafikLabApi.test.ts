/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchStops, getDepartures } from './trafikLabApi';

(globalThis as any).fetch = vi.fn();

describe('trafikLabApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_WORKER_URL', '');
  });

  describe('searchStops', () => {
    it('should return empty array for short queries', async () => {
      const result = await searchStops('a');
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should call API and return stop results', async () => {
      const mockStops = {
        stops: [
          { stopId: '1001', name: 'Stockholm Central', lat: 59.33, lon: 18.06 },
          { stopId: '1002', name: 'Stockholm Södra', lat: 59.31, lon: 18.07 }
        ]
      };
      
      (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockStops
      });

      const result = await searchStops('stockholm');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://transport.trafiklab.se/api2/v1/stops/name/stockholm?key=0c550026cea14ec981c7b0c440f459ff'
      );
      expect(result).toHaveLength(2);
      expect(result[0].siteId).toBe('1001');
    });

    it('should throw on API error', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(searchStops('test')).rejects.toThrow('API error: 500');
    });
  });

  describe('getDepartures', () => {
    it('should return departures from API', async () => {
      const mockDepartures = {
        Departures: [
          {
            lineNumber: '42',
            linePublicName: 'Line 42',
            destination: 'Slussen',
            departureTime: new Date(Date.now() + 5 * 60000).toISOString(),
            transportMode: 'BUS'
          }
        ]
      };
      
      (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartures
      });

      const result = await getDepartures('1001');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://transport.trafiklab.se/api2/v1/timetable/1001?key=6cd9fc5c2f6d477684a99be7eaa4962b'
      );
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe('42');
      expect(result[0].transportType).toBe('bus');
    });

    it('should throw on API error', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      await expect(getDepartures('1001')).rejects.toThrow('API error: 404');
    });
  });
});
