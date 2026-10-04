import type {
  DepartureFetchDiagnostics,
  TransitDeparture,
  TransitService,
  TransitStopSearchResult,
} from '../providers/types';

export type NearbyView = 'nearby' | 'board';
export type PreviewState =
  | { state: 'loading' }
  | { state: 'ready'; departures: TransitDeparture[] }
  | { state: 'empty' }
  | { state: 'unavailable' };

export type NearbySessionSnapshot = {
  query: string;
  nearbyStops: TransitStopSearchResult[];
  searchResults: TransitStopSearchResult[];
  selectedId: string | null;
  previews: Map<string, PreviewState>;
  loading: boolean;
  searching: boolean;
  error: 'offline' | 'load' | null;
  searchError: boolean;
  board: {
    stopId: string | null;
    departures: TransitDeparture[];
    loading: boolean;
    refreshing: boolean;
    error: boolean;
    emptyState: 'none' | 'empty' | 'invalid';
    diagnostics?: DepartureFetchDiagnostics;
    stopDeviations: unknown[];
    extendedForecast: boolean;
  };
  scroll: { nearby: number; board: number };
};

export type NearbyClock = {
  now(): number;
  setTimeout(fn: () => void, delay: number): number;
  clearTimeout(handle: number): void;
  setInterval(fn: () => void, delay: number): number;
  clearInterval(handle: number): void;
};

export type NearbySession = {
  subscribe(fn: (value: NearbySessionSnapshot) => void): () => void;
  activate(view: NearbyView, stop: TransitStopSearchResult | null): void;
  deactivate(): void;
  setOrigin(origin: [number, number] | null, accuracy: number | null): void;
  setQuery(query: string): void;
  selectStop(stop: TransitStopSearchResult): void;
  refresh(): Promise<void>;
  setScroll(view: NearbyView, top: number): void;
  destroy(): void;
};

type RequestGroup = { generation: number; controller: AbortController | null };

function isSameCoord(left: [number, number] | null, right: [number, number] | null): boolean {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function createNearbySession(options: {
  transit: Pick<TransitService, 'searchStops' | 'getNearbyStops' | 'getDepartures'>;
  clock: NearbyClock;
}): NearbySession {
  const listeners = new Set<(value: NearbySessionSnapshot) => void>();
  let active = false;
  let destroyed = false;
  let view: NearbyView = 'nearby';
  let origin: [number, number] | null = null;
  let accuracy: number | null = null;
  let boardStop: TransitStopSearchResult | null = null;
  let searchTimer: number | null = null;
  let boardTimer: number | null = null;
  let catalog: RequestGroup = { generation: 0, controller: null };
  let search: RequestGroup = { generation: 0, controller: null };
  let previews: RequestGroup = { generation: 0, controller: null };
  let board: RequestGroup = { generation: 0, controller: null };
  let snapshot: NearbySessionSnapshot = {
    query: '',
    nearbyStops: [],
    searchResults: [],
    selectedId: null,
    previews: new Map(),
    loading: false,
    searching: false,
    error: null,
    searchError: false,
    board: {
      stopId: null,
      departures: [],
      loading: false,
      refreshing: false,
      error: false,
      emptyState: 'none',
      stopDeviations: [],
      extendedForecast: false,
    },
    scroll: { nearby: 0, board: 0 },
  };

  function copySnapshot(): NearbySessionSnapshot {
    return {
      ...snapshot,
      nearbyStops: [...snapshot.nearbyStops],
      searchResults: [...snapshot.searchResults],
      previews: new Map(snapshot.previews),
      board: {
        ...snapshot.board,
        departures: [...snapshot.board.departures],
        stopDeviations: [...snapshot.board.stopDeviations],
      },
      scroll: { ...snapshot.scroll },
    };
  }

  function publish(): void {
    if (destroyed) return;
    const value = copySnapshot();
    listeners.forEach((listener) => listener(value));
  }

  function abort(group: RequestGroup): void {
    group.generation += 1;
    group.controller?.abort();
    group.controller = null;
  }

  function cancelSearchTimer(): void {
    if (!searchTimer) return;
    options.clock.clearTimeout(searchTimer);
    searchTimer = null;
  }

  function stopBoardTimer(): void {
    if (!boardTimer) return;
    options.clock.clearInterval(boardTimer);
    boardTimer = null;
  }

  async function fetchPreviews(stops: TransitStopSearchResult[]): Promise<void> {
    abort(previews);
    const generation = previews.generation;
    const controller = new AbortController();
    previews.controller = controller;
    const initial = new Map<string, PreviewState>();
    for (const stop of stops) initial.set(stop.id, snapshot.previews.get(stop.id) ?? { state: 'loading' });
    snapshot = { ...snapshot, previews: initial };
    publish();
    const pending = stops.filter((stop) => initial.get(stop.id)?.state === 'loading');
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < pending.length && active && view === 'nearby' && generation === previews.generation) {
        const stop = pending[cursor++];
        let next: PreviewState;
        try {
          const result = await options.transit.getDepartures(stop.id, stop.name, undefined, undefined, controller.signal);
          const departures = result.departures
            .filter((item) => item.minutes >= 0)
            .sort((left, right) => left.minutes - right.minutes)
            .slice(0, 2);
          next = departures.length ? { state: 'ready', departures } : { state: 'empty' };
        } catch (error) {
          if (isAbort(error)) return;
          next = { state: 'unavailable' };
        }
        if (!active || view !== 'nearby' || generation !== previews.generation) return;
        const updated = new Map(snapshot.previews);
        updated.set(stop.id, next);
        snapshot = { ...snapshot, previews: updated };
        publish();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  }

  async function fetchCatalog(): Promise<void> {
    if (!active || view !== 'nearby' || !origin) return;
    abort(catalog);
    const generation = catalog.generation;
    const controller = new AbortController();
    catalog.controller = controller;
    snapshot = { ...snapshot, loading: snapshot.nearbyStops.length === 0, error: null };
    publish();
    try {
      const stops = await options.transit.getNearbyStops({ origin, radiusMeters: 2000, limit: 12 }, controller.signal);
      if (!active || view !== 'nearby' || generation !== catalog.generation) return;
      snapshot = {
        ...snapshot,
        nearbyStops: stops,
        selectedId: snapshot.selectedId && stops.some((stop) => stop.id === snapshot.selectedId) ? snapshot.selectedId : stops[0]?.id ?? null,
        error: stops.length ? null : 'load',
      };
      publish();
      void fetchPreviews(stops);
    } catch (error) {
      if (!active || generation !== catalog.generation || isAbort(error)) return;
      snapshot = { ...snapshot, nearbyStops: [], error: isOffline() ? 'offline' : 'load' };
      publish();
    } finally {
      if (active && generation === catalog.generation) {
        snapshot = { ...snapshot, loading: false };
        publish();
      }
    }
  }

  async function fetchSearch(): Promise<void> {
    const query = snapshot.query.trim();
    if (!active || view !== 'nearby' || query.length < 2) return;
    abort(search);
    const generation = search.generation;
    const controller = new AbortController();
    search.controller = controller;
    snapshot = { ...snapshot, searching: true, searchError: false };
    publish();
    try {
      const stops = await options.transit.searchStops(query, controller.signal);
      if (!active || view !== 'nearby' || generation !== search.generation || snapshot.query.trim() !== query) return;
      snapshot = {
        ...snapshot,
        searchResults: stops,
        selectedId: stops.some((stop) => stop.id === snapshot.selectedId) ? snapshot.selectedId : stops[0]?.id ?? null,
      };
      publish();
      void fetchPreviews(stops);
    } catch (error) {
      if (!active || generation !== search.generation || isAbort(error)) return;
      snapshot = { ...snapshot, searchResults: [], searchError: true };
      publish();
    } finally {
      if (active && generation === search.generation) {
        snapshot = { ...snapshot, searching: false };
        publish();
      }
    }
  }

  async function fetchBoard(allowExtendedForecast: boolean): Promise<void> {
    const stop = boardStop;
    if (!active || view !== 'board' || !stop) return;
    abort(board);
    const generation = board.generation;
    const controller = new AbortController();
    board.controller = controller;
    snapshot = {
      ...snapshot,
      board: {
        ...snapshot.board,
        stopId: stop.id,
        loading: snapshot.board.departures.length === 0,
        refreshing: snapshot.board.departures.length > 0,
        error: false,
        emptyState: 'none',
      },
    };
    publish();
    try {
      let result = await options.transit.getDepartures(stop.id, stop.name, undefined, undefined, controller.signal);
      const initialStopDeviations = result.stopDeviations ?? [];
      let extendedForecast = false;
      if (allowExtendedForecast && result.departures.length === 0) {
        result = await options.transit.getDepartures(stop.id, stop.name, undefined, undefined, controller.signal, { forecastMinutes: 720 });
        extendedForecast = true;
      }
      const departures = result.departures.filter((item) => item.minutes >= 0).sort((left, right) => left.minutes - right.minutes);
      if (!active || view !== 'board' || generation !== board.generation || boardStop?.id !== stop.id) return;
      snapshot = {
        ...snapshot,
        board: {
          stopId: stop.id,
          departures: extendedForecast ? departures.slice(0, 12) : departures,
          loading: false,
          refreshing: false,
          error: false,
          emptyState: departures.length === 0 && result.diagnostics?.rawCount && result.diagnostics.validCount === 0 ? 'invalid' : departures.length ? 'none' : 'empty',
          diagnostics: result.diagnostics,
          stopDeviations: result.stopDeviations?.length ? result.stopDeviations : initialStopDeviations,
          extendedForecast: extendedForecast && departures.length > 0,
        },
      };
      publish();
    } catch (error) {
      if (!active || generation !== board.generation || boardStop?.id !== stop.id || isAbort(error)) return;
      snapshot = { ...snapshot, board: { ...snapshot.board, loading: false, refreshing: false, error: true } };
      publish();
    }
  }

  function activate(nextView: NearbyView, stop: TransitStopSearchResult | null): void {
    if (destroyed) return;
    const sameBoard = nextView !== 'board' || boardStop?.id === stop?.id;
    active = true;
    view = nextView;
    if (nextView === 'nearby') {
      stopBoardTimer();
      abort(board);
      if (snapshot.query.trim().length >= 2) {
        cancelSearchTimer();
        void fetchSearch();
      } else {
        void fetchCatalog();
      }
      return;
    }
    if (!stop) return;
    if (!sameBoard) {
      abort(board);
      boardStop = stop;
      snapshot = { ...snapshot, board: { ...snapshot.board, stopId: stop.id, departures: [], error: false, diagnostics: undefined, stopDeviations: [], extendedForecast: false } };
      publish();
    }
    void fetchBoard(true);
    if (!boardTimer) boardTimer = options.clock.setInterval(() => void fetchBoard(false), 30_000);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(copySnapshot());
      return () => listeners.delete(listener);
    },
    activate,
    deactivate() {
      if (destroyed || !active) return;
      active = false;
      cancelSearchTimer();
      stopBoardTimer();
      abort(catalog);
      abort(search);
      abort(previews);
      abort(board);
      snapshot = { ...snapshot, loading: false, searching: false, board: { ...snapshot.board, loading: false, refreshing: false } };
      publish();
    },
    setOrigin(nextOrigin, nextAccuracy) {
      if (isSameCoord(origin, nextOrigin) && accuracy === nextAccuracy) return;
      origin = nextOrigin;
      accuracy = nextAccuracy;
      if (active && view === 'nearby') void fetchCatalog();
    },
    setQuery(query) {
      if (destroyed || snapshot.query === query) return;
      snapshot = { ...snapshot, query };
      cancelSearchTimer();
      abort(search);
      if (query.trim().length < 2) {
        snapshot = { ...snapshot, searchResults: [], searching: false, searchError: false, scroll: { ...snapshot.scroll, nearby: 0 } };
        publish();
        return;
      }
      snapshot = { ...snapshot, searching: active && view === 'nearby', searchError: false, scroll: { ...snapshot.scroll, nearby: 0 } };
      publish();
      if (active && view === 'nearby') searchTimer = options.clock.setTimeout(() => { searchTimer = null; void fetchSearch(); }, 220);
    },
    selectStop(stop) {
      if (destroyed) return;
      snapshot = { ...snapshot, selectedId: stop.id };
      publish();
    },
    async refresh() {
      if (!active || destroyed) return;
      if (view === 'board') await fetchBoard(false);
      else if (snapshot.query.trim().length >= 2) await fetchSearch();
      else await fetchCatalog();
    },
    setScroll(target, top) {
      if (destroyed) return;
      snapshot = { ...snapshot, scroll: { ...snapshot.scroll, [target]: Math.max(0, top) } };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      active = false;
      cancelSearchTimer();
      stopBoardTimer();
      abort(catalog);
      abort(search);
      abort(previews);
      abort(board);
      listeners.clear();
    },
  };
}
