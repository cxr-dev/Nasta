import type { DeviationMessage } from "../types/deviation";
import { persistentCache } from "./persistentCache";

const CACHE_KEY = "deviations:v1";
const MAX_CACHE_AGE_MS = 15 * 60 * 1000;
const LOCAL_STORAGE_KEY = "nasta_deviations_cache_v1";

interface DeviationCachePayload {
  updatedAt: number;
  messages: DeviationMessage[];
}

export async function loadDeviationCache(): Promise<DeviationCachePayload | null> {
  await persistentCache.migrateFromLocalStorage(LOCAL_STORAGE_KEY, CACHE_KEY, MAX_CACHE_AGE_MS);
  const data = await persistentCache.get(CACHE_KEY);
  if (!data) return null;
  const parsed = data as DeviationCachePayload;
  if (!Array.isArray(parsed.messages) || typeof parsed.updatedAt !== "number") {
    return null;
  }
  if (Date.now() - parsed.updatedAt > MAX_CACHE_AGE_MS) {
    return null;
  }
  return parsed;
}

export async function saveDeviationCache(messages: DeviationMessage[]): Promise<void> {
  try {
    const payload: DeviationCachePayload = {
      updatedAt: Date.now(),
      messages,
    };
    await persistentCache.set(CACHE_KEY, payload, MAX_CACHE_AGE_MS);
  } catch {
    // no-op
  }
}

