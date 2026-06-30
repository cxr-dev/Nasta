import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cacheScheduleTime,
  getCachedSchedule,
  clearExpiredCache,
  getCacheStats,
  clearAllCache,
} from "../services/scheduleCache";
import type { Departure } from "../types/departure";

const TEST_NOW = new Date("2026-04-15T12:00:00Z").getTime();

// Mock persistentCache with simple in-memory store — scheduleCache's in-memory
// layer already does the real work; persistentCache is secondary persistence.
// With fake-indexeddb + vi.useFakeTimers(), IDB operations hang, so we mock it.
const store = new Map<string, unknown>();
vi.mock("../services/persistentCache", () => ({
  persistentCache: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    remove: vi.fn(async (key: string) => { store.delete(key); }),
    clearExpired: vi.fn(async () => {}),
    getAllKeys: vi.fn(async () => Array.from(store.keys())),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

describe("scheduleCache service", () => {
  beforeEach(async () => {
    store.clear();
    await clearAllCache();
    vi.useFakeTimers({ now: TEST_NOW });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await clearAllCache();
  });

  describe("cacheScheduleTime", () => {
    it("should cache a single scheduled time", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;
      const scheduledTime = new Date("2026-04-15T14:30:00Z");

      await cacheScheduleTime(siteId, line, direction, scheduledTime);

      const cached = await getCachedSchedule(siteId, line, direction);
      expect(cached).not.toBeNull();
      expect(cached?.length).toBe(1);
      expect(cached?.[0].time).toBe("16:30"); // UTC+2 Stockholm
    });

    it("should accumulate multiple scheduled times", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;

      await cacheScheduleTime(siteId, line, direction, new Date("2026-04-15T14:30:00Z"));
      await cacheScheduleTime(siteId, line, direction, new Date("2026-04-15T14:45:00Z"));
      await cacheScheduleTime(siteId, line, direction, new Date("2026-04-15T15:00:00Z"));

      const cached = await getCachedSchedule(siteId, line, direction);
      expect(cached?.length).toBe(3);
    });

    it("should filter out past times when retrieving cached schedule", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;
      const now = Date.now();

      const pastTime = new Date(now - 60 * 60 * 1000);
      const futureTime = new Date(now + 30 * 60 * 1000);

      await cacheScheduleTime(siteId, line, direction, pastTime);
      await cacheScheduleTime(siteId, line, direction, futureTime);

      const cached = await getCachedSchedule(siteId, line, direction);
      expect(cached?.length).toBeGreaterThan(0);
      expect(cached?.every((d) => d.minutes > 0)).toBe(true);
    });

    it("should deduplicate identical scheduled times", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;
      const time = new Date("2026-04-15T14:30:00Z");

      await cacheScheduleTime(siteId, line, direction, time);
      await cacheScheduleTime(siteId, line, direction, time); // duplicate
      await cacheScheduleTime(siteId, line, direction, time); // duplicate

      const cached = await getCachedSchedule(siteId, line, direction);
      expect(cached?.length).toBe(1);
    });

    it("should handle different directions as separate cache entries", async () => {
      const siteId = "1001";
      const line = "76";

      await cacheScheduleTime(siteId, line, 1, new Date("2026-04-15T14:30:00Z"));
      await cacheScheduleTime(siteId, line, 2, new Date("2026-04-15T15:00:00Z"));

      const dir1Cache = await getCachedSchedule(siteId, line, 1);
      const dir2Cache = await getCachedSchedule(siteId, line, 2);

      expect(dir1Cache?.length).toBe(1);
      expect(dir2Cache?.length).toBe(1);
      expect(dir1Cache?.[0].time).toBe("16:30"); // UTC+2 Stockholm
      expect(dir2Cache?.[0].time).toBe("17:00"); // UTC+2 Stockholm
    });
  });

  describe("getCachedSchedule", () => {
    it("should return null if no cache exists", async () => {
      const cached = await getCachedSchedule("9999", "99", 0);
      expect(cached).toBeNull();
    });

    it("should return cached departures as Departure[] format", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;

      await cacheScheduleTime(siteId, line, direction, new Date("2026-04-15T14:30:00Z"));

      const cached = await getCachedSchedule(siteId, line, direction);
      expect(cached).toBeInstanceOf(Array);
      expect(cached?.[0]).toHaveProperty("line");
      expect(cached?.[0]).toHaveProperty("time");
      expect(cached?.[0]).toHaveProperty("minutes");
    });

    it("should respect maxAgeHours parameter", async () => {
      const siteId = "1001";
      const line = "76";
      const direction = 1;

      const yesterdayTime = new Date(TEST_NOW - 30 * 60 * 60 * 1000);
      await cacheScheduleTime(siteId, line, direction, yesterdayTime);

      const stats = await getCacheStats();
      expect(stats.entries).toBe(1);
      expect(stats.routes[0].timeCount).toBe(1);
    });
  });

  describe("clearExpiredCache", () => {
    it("should remove entries older than maxAgeHours", async () => {
      const siteId = "1001";
      const line = "76";

      vi.useFakeTimers({ now: new Date("2026-04-10").getTime() });
      await cacheScheduleTime(siteId, line, 1, new Date("2026-04-10T14:30:00Z"));

      vi.setSystemTime(new Date("2026-04-12").getTime());
      await cacheScheduleTime(siteId, line, 2, new Date("2026-04-12T14:30:00Z"));

      await clearExpiredCache(24);

      const oldCache = await getCachedSchedule(siteId, line, 1);
      const newCache = await getCachedSchedule(siteId, line, 2);

      expect(oldCache).toBeNull();
      expect(newCache).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      await cacheScheduleTime("1001", "76", 1, new Date("2026-04-15T14:30:00Z"));
      await cacheScheduleTime("1001", "76", 2, new Date("2026-04-15T14:30:00Z"));
      await cacheScheduleTime("1002", "77", 3, new Date("2026-04-15T14:30:00Z"));

      const stats = await getCacheStats();
      expect(stats.entries).toBe(3);
      expect(stats.routes).toHaveLength(3);
    });

    it("should return 0 entries for empty cache", async () => {
      const stats = await getCacheStats();
      expect(stats.entries).toBe(0);
      expect(stats.routes).toHaveLength(0);
    });
  });

  describe("clearAllCache", () => {
    it("should clear all cached data", async () => {
      await cacheScheduleTime("1001", "76", 1, new Date("2026-04-15T14:30:00Z"));
      await cacheScheduleTime("1001", "76", 2, new Date("2026-04-15T14:30:00Z"));

      await clearAllCache();

      const stats = await getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });
});
