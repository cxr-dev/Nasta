import type { DeviationMessage } from "../types/deviation";

const STORAGE_KEY = "nasta_deviations_cache_v1";
const MAX_CACHE_AGE_MS = 15 * 60 * 1000;

interface DeviationCachePayload {
  updatedAt: number;
  messages: DeviationMessage[];
}

export function loadDeviationCache(): DeviationCachePayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviationCachePayload;
    if (!Array.isArray(parsed.messages) || typeof parsed.updatedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.updatedAt > MAX_CACHE_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeviationCache(messages: DeviationMessage[]): void {
  try {
    const payload: DeviationCachePayload = {
      updatedAt: Date.now(),
      messages,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

