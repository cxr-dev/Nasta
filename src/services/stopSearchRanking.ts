import type { TransitStopSearchResult } from '../providers/types';
import { distanceMeters } from './geo';

type TextMatchTier = 0 | 1 | 2 | 3 | 4;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function textMatchTier(name: string, query: string): TextMatchTier {
  const normalizedName = normalizeText(name);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 4;
  if (normalizedName.startsWith(normalizedQuery)) return 3;
  if (normalizedName.split(' ').some((token) => token.startsWith(normalizedQuery))) return 2;
  return normalizedName.includes(normalizedQuery) ? 1 : 0;
}

/** Keeps text intent decisive, then uses distance for comparable matches. */
export function rankStopSearchResults(
  results: TransitStopSearchResult[],
  query: string,
  origin?: [number, number] | null,
): TransitStopSearchResult[] {
  const validOrigin = origin?.every(Number.isFinite) === true ? origin : null;
  const ranked = results.map((result) => {
    const coord = result.coord;
    const distance = validOrigin && coord && coord.every(Number.isFinite)
      ? distanceMeters(validOrigin[0], validOrigin[1], coord[0], coord[1])
      : undefined;
    return { result, distance };
  });

  return ranked
    .sort((a, b) => {
      const tierDifference = textMatchTier(b.result.name, query) - textMatchTier(a.result.name, query);
      if (tierDifference !== 0) return tierDifference;
      if (validOrigin) {
        const aHasDistance = a.distance != null;
        const bHasDistance = b.distance != null;
        if (aHasDistance !== bHasDistance) return aHasDistance ? -1 : 1;
        if (a.distance != null && b.distance != null && a.distance !== b.distance) {
          return a.distance - b.distance;
        }
      }
      const relevanceDifference = b.result.relevance - a.result.relevance;
      if (relevanceDifference !== 0) return relevanceDifference;
      return a.result.name.localeCompare(b.result.name, 'sv-SE') || a.result.id.localeCompare(b.result.id, 'sv-SE');
    })
    .map(({ result, distance }) => distance == null ? result : { ...result, distance });
}
