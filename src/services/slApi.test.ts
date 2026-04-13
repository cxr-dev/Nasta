/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchSites, getDepartures } from './slApi';

(globalThis as any).fetch = vi.fn();

describe('slApi service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('searchSites', () => {
    it('returns empty array for short query', async () => {
      expect(await searchSites('a')).toEqual([]);
      expect(await searchSites('')).toEqual([]);
    });

    it('returns search results', async () => {
      const mockSites = [
        { id: 9001, name: 'Test stop', note: '', lat: 59.3, lon: 18.1, stop_areas: [9001] }
      ];
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSites
      });

      const results = await searchSites('test');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Test stop');
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
      const mockDepartures = {
        departures: [
          { line: { designation: '76' }, destination: 'Test', expected: '2024-01-01T08:04:00', scheduled: '2024-01-01T08:00:00' }
        ]
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures
      });

      const result = await getDepartures('9001');
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe('76');
      expect(result[0].time).toBe('08:04');
    });

    it('falls back to scheduled time when expected is absent', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T08:00:30'));

      const mockDepartures = {
        departures: [
          { line: { designation: '76' }, destination: 'Test', scheduled: '2024-01-01T08:04:00' }
        ]
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures
      });

      const result = await getDepartures('9001');
      expect(result[0].time).toBe('08:04');
      expect(result[0].minutes).toBe(3);
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
