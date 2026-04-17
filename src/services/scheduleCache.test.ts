import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cacheScheduleTime,
  getCachedSchedule,
  clearExpiredCache,
  getCacheStats,
  clearAllCache,
} from '../services/scheduleCache';
import type { Departure } from '../types/departure';

describe('scheduleCache service', () => {
  beforeEach(() => {
    clearAllCache();
  });

  afterEach(() => {
    clearAllCache();
  });

  describe('cacheScheduleTime', () => {
    it('should cache a single scheduled time', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';
      const scheduledTime = new Date('2026-04-15T14:30:00Z');

      cacheScheduleTime(siteId, line, direction, scheduledTime);

      const cached = getCachedSchedule(siteId, line, direction);
      expect(cached).not.toBeNull();
      expect(cached?.length).toBe(1);
      expect(cached?.[0].time).toBe('14:30');
    });

    it('should accumulate multiple scheduled times', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';

      cacheScheduleTime(siteId, line, direction, new Date('2026-04-15T14:30:00Z'));
      cacheScheduleTime(siteId, line, direction, new Date('2026-04-15T14:45:00Z'));
      cacheScheduleTime(siteId, line, direction, new Date('2026-04-15T15:00:00Z'));

      const cached = getCachedSchedule(siteId, line, direction);
      expect(cached?.length).toBe(3);
    });

    it('should filter out past times when retrieving cached schedule', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';
      const now = Date.now();

      // Cache 1 hour ago (should be filtered)
      const pastTime = new Date(now - 60 * 60 * 1000);
      // Cache 30 minutes in future (should be included)
      const futureTime = new Date(now + 30 * 60 * 1000);

      cacheScheduleTime(siteId, line, direction, pastTime);
      cacheScheduleTime(siteId, line, direction, futureTime);

      const cached = getCachedSchedule(siteId, line, direction);
      // Should only include future times
      expect(cached?.length).toBeGreaterThan(0);
      expect(cached?.every((d) => d.minutes > 0)).toBe(true);
    });

    it('should deduplicate identical scheduled times', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';
      const time = new Date('2026-04-15T14:30:00Z');

      cacheScheduleTime(siteId, line, direction, time);
      cacheScheduleTime(siteId, line, direction, time); // duplicate
      cacheScheduleTime(siteId, line, direction, time); // duplicate

      const cached = getCachedSchedule(siteId, line, direction);
      expect(cached?.length).toBe(1);
    });

    it('should handle different directions as separate cache entries', () => {
      const siteId = '1001';
      const line = '76';

      cacheScheduleTime(siteId, line, 'Fruängen', new Date('2026-04-15T14:30:00Z'));
      cacheScheduleTime(siteId, line, 'Ropsten', new Date('2026-04-15T15:00:00Z'));

      const fruångenCache = getCachedSchedule(siteId, line, 'Fruängen');
      const ropstenCache = getCachedSchedule(siteId, line, 'Ropsten');

      expect(fruångenCache?.length).toBe(1);
      expect(ropstenCache?.length).toBe(1);
      expect(fruångenCache?.[0].time).toBe('14:30');
      expect(ropstenCache?.[0].time).toBe('15:00');
    });
  });

  describe('getCachedSchedule', () => {
    it('should return null if no cache exists', () => {
      const cached = getCachedSchedule('9999', '99', 'Nowhere');
      expect(cached).toBeNull();
    });

    it('should return cached departures as Departure[] format', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';

      cacheScheduleTime(siteId, line, direction, new Date('2026-04-15T14:30:00Z'));

      const cached = getCachedSchedule(siteId, line, direction);
      expect(cached).toBeInstanceOf(Array);
      expect(cached?.[0]).toHaveProperty('line');
      expect(cached?.[0]).toHaveProperty('time');
      expect(cached?.[0]).toHaveProperty('minutes');
    });

    it('should respect maxAgeHours parameter', () => {
      const siteId = '1001';
      const line = '76';
      const direction = 'Fruängen';

      // Store with old timestamp
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      cacheScheduleTime(siteId, line, direction, oldTime);

      // Should be found with 48+ hour tolerance
      const cached48h = getCachedSchedule(siteId, line, direction, 48);
      expect(cached48h).not.toBeNull();

      // Should NOT be found with 24 hour tolerance
      const cached24h = getCachedSchedule(siteId, line, direction, 24);
      expect(cached24h).toBeNull();
    });
  });

  describe('clearExpiredCache', () => {
    it('should remove entries older than maxAgeHours', () => {
      const siteId = '1001';
      const line = '76';

      // Store old entry
      vi.useFakeTimers({ now: new Date('2026-04-10').getTime() });
      cacheScheduleTime(siteId, line, 'Old', new Date('2026-04-10T14:30:00Z'));

      // Move time forward
      vi.setSystemTime(new Date('2026-04-12').getTime());

      // Store new entry
      cacheScheduleTime(siteId, line, 'New', new Date('2026-04-12T14:30:00Z'));

      // Clear entries older than 24 hours
      clearExpiredCache(24);

      const oldCache = getCachedSchedule(siteId, line, 'Old');
      const newCache = getCachedSchedule(siteId, line, 'New');

      expect(oldCache).toBeNull(); // Old entry should be cleared
      expect(newCache).not.toBeNull(); // New entry should remain

      vi.useRealTimers();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      cacheScheduleTime('1001', '76', 'A', new Date('2026-04-15T14:30:00Z'));
      cacheScheduleTime('1001', '76', 'B', new Date('2026-04-15T14:30:00Z'));
      cacheScheduleTime('1002', '77', 'C', new Date('2026-04-15T14:30:00Z'));

      const stats = getCacheStats();
      expect(stats.entries).toBe(3);
      expect(stats.routes).toHaveLength(3);
    });

    it('should return 0 entries for empty cache', () => {
      const stats = getCacheStats();
      expect(stats.entries).toBe(0);
      expect(stats.routes).toHaveLength(0);
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cached data', () => {
      cacheScheduleTime('1001', '76', 'A', new Date('2026-04-15T14:30:00Z'));
      cacheScheduleTime('1001', '76', 'B', new Date('2026-04-15T14:30:00Z'));

      clearAllCache();

      const stats = getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });
});
