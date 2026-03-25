/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSites, getDepartures } from './slApi';

(globalThis as any).fetch = vi.fn();

describe('slApi service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchSites', () => {
    it('returns empty array for short query', async () => {
      expect(await searchSites('a')).toEqual([]);
      expect(await searchSites('')).toEqual([]);
    });

    it('returns search results', async () => {
      const mockResults = [{ siteId: '9001', name: 'Test', type: 'stop' }];
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResults
      });

      const results = await searchSites('test');
      expect(results).toEqual(mockResults);
      expect((globalThis as any).fetch).toHaveBeenCalledWith(
        'https://transport.integration.sl.se/v1/sites?search=test'
      );
    });

    it('throws on API error', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(searchSites('test')).rejects.toThrow('API error: 500');
    });
  });

  describe('getDepartures', () => {
    it('returns departures for site', async () => {
      const mockDepartures = [
        { line: '76', destination: 'Test', timeToDeparture: 4, plannedDepartureTime: '08:04', deviation: 0 }
      ];
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ departures: mockDepartures })
      });

      const result = await getDepartures('9001');
      expect(result).toHaveLength(1);
      expect(result[0].minutes).toBe(4);
      expect(result[0].time).toBe('08:04');
    });

    it('throws on API error', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(getDepartures('9001')).rejects.toThrow('API error: 404');
    });
  });
});
