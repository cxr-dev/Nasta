import type { DeckDestination } from '../lib/deckNavigation';
import type { Page } from '../types/page';

export function createPageActivation(options: {
  start(page: Page, generation: number): Promise<void>;
  stop(): void;
  refresh(page: Page, generation: number): Promise<void>;
  onError(error: unknown): void;
}): {
  setDestination(destination: DeckDestination, page: Page | null): void;
  setPaused(paused: boolean): void;
  isCurrent(generation: number): boolean;
  refresh(): Promise<void>;
  destroy(): void;
} {
  let generation = 0;
  let destination: DeckDestination | null = null;
  let page: Page | null = null;
  let paused = false;
  let destroyed = false;
  let refreshPromise: Promise<void> | null = null;

  function eligible(): boolean {
    return !destroyed && !paused && destination?.kind === 'page' && page !== null;
  }

  function sameDestination(left: DeckDestination | null, right: DeckDestination): boolean {
    if (!left || left.kind !== right.kind) return false;
    if (left.kind === 'page' && right.kind === 'page') return left.pageId === right.pageId;
    if (left.kind === 'board' && right.kind === 'board') return left.stopId === right.stopId;
    return left.kind === 'nearby' && right.kind === 'nearby';
  }

  function invalidate(): number {
    generation += 1;
    refreshPromise = null;
    options.stop();
    return generation;
  }

  function startCurrent(): void {
    if (!eligible()) return;
    const current = generation;
    void options.start(page!, current).catch((error) => {
      if (api.isCurrent(current)) options.onError(error);
    });
  }

  const api = {
    setDestination(nextDestination: DeckDestination, nextPage: Page | null): void {
      if (destroyed) return;
      const unchanged = sameDestination(destination, nextDestination) && page === nextPage;
      destination = nextDestination;
      page = nextPage;
      if (unchanged) return;
      invalidate();
      startCurrent();
    },
    setPaused(nextPaused: boolean): void {
      if (destroyed || paused === nextPaused) return;
      paused = nextPaused;
      invalidate();
      if (!paused) startCurrent();
    },
    isCurrent(value: number): boolean {
      return !destroyed && !paused && value === generation && destination?.kind === 'page' && page !== null;
    },
    async refresh(): Promise<void> {
      if (!eligible()) return;
      if (refreshPromise) return refreshPromise;
      const current = generation;
      refreshPromise = options.refresh(page!, current)
        .catch((error) => {
          if (api.isCurrent(current)) options.onError(error);
        })
        .finally(() => {
          if (current === generation) refreshPromise = null;
        });
      return refreshPromise;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      refreshPromise = null;
      options.stop();
    },
  };

  return api;
}
