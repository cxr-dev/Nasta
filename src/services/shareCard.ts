import {
  renderShareImage,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  type ShareCardData,
  type ShareCardRendererOptions,
} from "../lib/shareImageRenderer";
import type { ResolvedTheme } from "../themes";
import { persistentCache } from "./persistentCache";

export interface ShareCard {
  blob: Blob;
  width: number;
  height: number;
}

interface CachedShareCard extends ShareCard {
  createdAt: number;
}

const CARD_TTL_MS = 10 * 60 * 1000;
const CACHE_PREFIX = "share-card:";

export function shareCardCacheKey(data: ShareCardData, theme: ResolvedTheme): string {
  return `${CACHE_PREFIX}${theme}:${JSON.stringify(data)}`;
}

function isFresh(card: CachedShareCard, now: number = Date.now()): boolean {
  return now - card.createdAt < CARD_TTL_MS;
}

async function readCached(key: string): Promise<CachedShareCard | null> {
  const raw = await persistentCache.get(key).catch(() => null);
  if (!raw || typeof raw !== "object") return null;
  const { blob, createdAt } = raw as { blob?: unknown; createdAt?: number };
  if (!(blob instanceof Blob)) return null;
  return { blob, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, createdAt: createdAt ?? 0 };
}

async function refreshShareCard(
  data: ShareCardData,
  theme: ResolvedTheme,
  opts: ShareCardRendererOptions,
  key: string,
): Promise<ShareCard | null> {
  const blob = await renderShareImage(data, theme, opts);
  if (!blob) return null;
  const card: CachedShareCard = { blob, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, createdAt: Date.now() };
  await persistentCache.set(key, card, CARD_TTL_MS).catch(() => {});
  return card;
}

/**
 * Resolve a share card with stale-while-refresh semantics.
 *
 * - Fresh cache hit: return immediately, refresh in the background.
 * - Stale or missing: render and cache.
 * - Render failure on a stale entry: keep the latest valid PNG.
 */
export async function getShareCard(
  data: ShareCardData,
  theme: ResolvedTheme,
  opts: ShareCardRendererOptions = {},
): Promise<ShareCard | null> {
  const key = shareCardCacheKey(data, theme);
  const cached = await readCached(key);
  if (cached && isFresh(cached)) {
    void refreshShareCard(data, theme, opts, key).catch(() => {});
    return cached;
  }
  const fresh = await refreshShareCard(data, theme, opts, key);
  return fresh ?? cached;
}
