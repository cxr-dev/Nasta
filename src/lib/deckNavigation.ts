export type DeckDestination =
  | { kind: 'page'; pageId: string }
  | { kind: 'nearby' }
  | { kind: 'board'; stopId: string };

type DeckHistoryState = {
  nastaDeck?: DeckDestination;
  [key: string]: unknown;
};

export function buildDeckDestinations(
  pageIds: string[],
  retainedBoardStopId: string | null,
): DeckDestination[] {
  return [
    ...pageIds.map((pageId): DeckDestination => ({ kind: 'page', pageId })),
    { kind: 'nearby' },
    ...(retainedBoardStopId
      ? [{ kind: 'board', stopId: retainedBoardStopId } as DeckDestination]
      : []),
  ];
}

export function deckDestinationIndex(
  destinations: DeckDestination[],
  destination: DeckDestination,
): number {
  return destinations.findIndex((candidate) => {
    if (candidate.kind !== destination.kind) return false;
    if (candidate.kind === 'page' && destination.kind === 'page') {
      return candidate.pageId === destination.pageId;
    }
    if (candidate.kind === 'board' && destination.kind === 'board') {
      return candidate.stopId === destination.stopId;
    }
    return candidate.kind === 'nearby';
  });
}

export function adjacentDeckDestination(
  destinations: DeckDestination[],
  destination: DeckDestination,
  direction: -1 | 1,
): DeckDestination | null {
  const index = deckDestinationIndex(destinations, destination);
  if (index < 0) return null;
  return destinations[index + direction] ?? null;
}

export function serializeDeckHistory(
  state: unknown,
  destination: DeckDestination,
): DeckHistoryState {
  const base = state && typeof state === 'object' ? state : {};
  return { ...base, nastaDeck: destination };
}

export function parseDeckHistory(state: unknown): DeckDestination | null {
  if (!state || typeof state !== 'object') return null;
  const destination = (state as DeckHistoryState).nastaDeck;
  if (!destination || typeof destination !== 'object') return null;
  if (destination.kind === 'nearby') return { kind: 'nearby' };
  if (destination.kind === 'page' && typeof destination.pageId === 'string') {
    return { kind: 'page', pageId: destination.pageId };
  }
  if (destination.kind === 'board' && typeof destination.stopId === 'string') {
    return { kind: 'board', stopId: destination.stopId };
  }
  return null;
}
