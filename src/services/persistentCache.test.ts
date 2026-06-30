import { describe, it, expect, beforeEach, vi } from "vitest";
import { persistentCache } from "./persistentCache";

beforeEach(async () => {
  // Clear all entries between tests
  const keys = await persistentCache.getAllKeys();
  for (const key of keys) {
    await persistentCache.remove(key);
  }
  localStorage.clear();
});

describe("persistentCache", () => {
  describe("set + get", () => {
    it("round-trips a string value", async () => {
      await persistentCache.set("key1", "hello", 60_000);
      const result = await persistentCache.get("key1");
      expect(result).toBe("hello");
    });

    it("round-trips an object value", async () => {
      const obj = { name: "test", count: 42 };
      await persistentCache.set("key2", obj, 60_000);
      const result = await persistentCache.get("key2");
      expect(result).toEqual(obj);
    });

    it("returns null for a missing key", async () => {
      const result = await persistentCache.get("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("TTL expiry", () => {
    it("returns null for an expired entry", async () => {
      await persistentCache.set("exp-key", "data", 0); // 0ms TTL — expired immediately
      // Allow microtask flush
      await new Promise((r) => setTimeout(r, 5));
      const result = await persistentCache.get("exp-key");
      expect(result).toBeNull();
    });

    it("returns value for a non-expired entry", async () => {
      await persistentCache.set("live-key", "live", 60_000);
      const result = await persistentCache.get("live-key");
      expect(result).toBe("live");
    });
  });

  describe("remove", () => {
    it("deletes an existing entry", async () => {
      await persistentCache.set("rm-key", "value", 60_000);
      await persistentCache.remove("rm-key");
      const result = await persistentCache.get("rm-key");
      expect(result).toBeNull();
    });

    it("does not throw when removing a missing key", async () => {
      await expect(persistentCache.remove("no-key")).resolves.toBeUndefined();
    });
  });

  describe("clearExpired", () => {
    it("removes only expired entries, keeps valid ones", async () => {
      await persistentCache.set("exp-1", "expired", 0);
      await persistentCache.set("live-1", "alive", 60_000);
      await persistentCache.set("exp-2", "expired2", 0);

      await new Promise((r) => setTimeout(r, 5));

      await persistentCache.clearExpired();

      const exp1 = await persistentCache.get("exp-1");
      const live = await persistentCache.get("live-1");
      const exp2 = await persistentCache.get("exp-2");

      expect(exp1).toBeNull();
      expect(live).toBe("alive");
      expect(exp2).toBeNull();
    });
  });

  describe("getAllKeys", () => {
    it("returns all keys", async () => {
      await persistentCache.set("a", "1", 60_000);
      await persistentCache.set("b", "2", 60_000);
      await persistentCache.set("c", "3", 60_000);

      const keys = await persistentCache.getAllKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(keys).toContain("c");
    });

    it("returns empty array for empty cache", async () => {
      const keys = await persistentCache.getAllKeys();
      expect(keys).toEqual([]);
    });
  });

  describe("migrateFromLocalStorage", () => {
    it("copies value from localStorage to cache and removes the localStorage key", async () => {
      localStorage.setItem("old_nasta_key", JSON.stringify({ migrated: true }));
      await persistentCache.migrateFromLocalStorage("old_nasta_key", "new_cache_key");
      const cached = await persistentCache.get("new_cache_key");
      expect(cached).toEqual({ migrated: true });
      expect(localStorage.getItem("old_nasta_key")).toBeNull();
    });

    it("is idempotent — second call is a no-op", async () => {
      localStorage.setItem("old_key_2", JSON.stringify({ v: 1 }));
      await persistentCache.migrateFromLocalStorage("old_key_2", "cache_2");
      // Modify localStorage after migration — it should be ignored
      localStorage.setItem("old_key_2", JSON.stringify({ v: 2 }));
      await persistentCache.migrateFromLocalStorage("old_key_2", "cache_2");
      const cached = await persistentCache.get("cache_2");
      expect(cached).toEqual({ v: 1 });
    });

    it("handles missing localStorage key gracefully", async () => {
      await expect(
        persistentCache.migrateFromLocalStorage("never_existed", "cache_x")
      ).resolves.toBeUndefined();
    });

    it("handles invalid JSON in localStorage gracefully", async () => {
      localStorage.setItem("bad_json", "not-json{");
      await expect(
        persistentCache.migrateFromLocalStorage("bad_json", "cache_bad")
      ).resolves.toBeUndefined();
    });
  });

  describe("in-memory fallback", () => {
    it("works when indexedDB is unavailable", async () => {
      // Simulate environment without indexedDB
      const orig = globalThis.indexedDB;
      try {
        // @ts-expect-error — simulating missing IDB
        delete globalThis.indexedDB;

        // Reset in-memory store (module-level state)
        const keys = await persistentCache.getAllKeys();
        for (const k of keys) await persistentCache.remove(k);

        await persistentCache.set("mem-key", "memory-value", 60_000);
        const result = await persistentCache.get("mem-key");
        expect(result).toBe("memory-value");

        await persistentCache.remove("mem-key");
        expect(await persistentCache.get("mem-key")).toBeNull();

        // getAllKeys works
        await persistentCache.set("k1", "v1", 60_000);
        await persistentCache.set("k2", "v2", 60_000);
        const allKeys = await persistentCache.getAllKeys();
        expect(allKeys).toContain("k1");
        expect(allKeys).toContain("k2");
      } finally {
        globalThis.indexedDB = orig;
      }
    });

    it("clearExpired works in in-memory fallback", async () => {
      const orig = globalThis.indexedDB;
      try {
        // @ts-expect-error
        delete globalThis.indexedDB;

        const keys = await persistentCache.getAllKeys();
        for (const k of keys) await persistentCache.remove(k);

        await persistentCache.set("mem-exp", "gone", 0);
        await persistentCache.set("mem-live", "keep", 60_000);

        await new Promise((r) => setTimeout(r, 5));
        await persistentCache.clearExpired();

        expect(await persistentCache.get("mem-exp")).toBeNull();
        expect(await persistentCache.get("mem-live")).toBe("keep");
      } finally {
        globalThis.indexedDB = orig;
      }
    });
  });
});
