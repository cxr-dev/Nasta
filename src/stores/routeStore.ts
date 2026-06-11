import { writable, derived, get } from "svelte/store";
import type { Page, Segment, TransportType, Stop } from "../types/route";
import { loadRoutes, saveRoutes } from "../services/storage";

function createRouteStore() {
  const initial = loadRoutes();
  const { subscribe, set, update } = writable<Page[]>(initial);

  return {
    subscribe,
    getAll: () => get({ subscribe }),

    addRoute: (name: string) => {
      const newPage: Page = {
        id: crypto.randomUUID(),
        name,
        segments: [],
      };

      update((pages) => {
        const updated = [...pages, newPage];

        saveRoutes(updated);
        return updated;
      });
      return newPage.id;
    },

    removeRoute: (id: string) => {
      update((pages) => {
        const updated = pages.filter((p) => p.id !== id);
        saveRoutes(updated);
        return updated;
      });
    },

    addSegment: (routeId: string, segment: Omit<Segment, "id">) => {
      const newSegment: Segment = {
        ...segment,
        id: crypto.randomUUID(),
      };

      update((pages) => {
        const updated = pages.map((page) => {
          if (page.id === routeId) {
            return { ...page, segments: [...page.segments, newSegment] };
          }
          return page;
        });

        saveRoutes(updated);
        return updated;
      });
    },

    removeSegment: (routeId: string, segmentId: string) => {
      update((pages) => {
        const updated = pages.map((p) => {
          if (p.id === routeId) {
            return {
              ...p,
              segments: p.segments.filter((s) => s.id !== segmentId),
            };
          }
          return p;
        });

        saveRoutes(updated);
        return updated;
      });
    },

    updateSegmentTransferBuffer: (
      routeId: string,
      segmentId: string,
      transferBufferMinutes: number,
    ) => {
      update((pages) => {
        const updated = pages.map((page) => {
          if (page.id !== routeId) return page;
          return {
            ...page,
            segments: page.segments.map((segment) =>
              segment.id === segmentId
                ? { ...segment, transferBufferMinutes }
                : segment,
            ),
          };
        });

        saveRoutes(updated);
        return updated;
      });
    },

    renameRoute: (id: string, name: string) => {
      update((pages) => {
        const updated = pages.map((p) =>
          p.id === id ? { ...p, name } : p,
        );
        saveRoutes(updated);
        return updated;
      });
    },

    reorderRoutes: (fromIndex: number, toIndex: number) => {
      update((pages) => {
        const updated = [...pages];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        saveRoutes(updated);
        return updated;
      });
    },

    reorderSegments: (routeId: string, fromIndex: number, toIndex: number) => {
      update((pages) => {
        const page = pages.find((p) => p.id === routeId);
        if (!page) return pages;

        const segments = [...page.segments];
        const [moved] = segments.splice(fromIndex, 1);
        segments.splice(toIndex, 0, moved);

        const updated = pages.map((p) => {
          if (p.id === routeId) {
            return { ...p, segments };
          }
          return p;
        });

        saveRoutes(updated);
        return updated;
      });
    },

    initialize: () => {
      const stored = loadRoutes();
      set(stored);
    },
  };
}

export const routeStore = createRouteStore();
export const selectedRouteId = writable<string | null>(null);
export const selectedRoute = derived(
  [routeStore, selectedRouteId],
  ([$routes, $selectedId]) => {
    if (!$routes || $routes.length === 0) return null;
    if (!$selectedId) return $routes[0] ?? null;
    return $routes.find((p) => p.id === $selectedId) ?? $routes[0] ?? null;
  },
);
