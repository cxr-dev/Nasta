import { writable, derived, get } from "svelte/store";
import type { Route, Direction } from "../types/route";
import { routeStore } from "./routeStore";

interface PageStoreState {
  pages: Route[];
  activePageId: string | null;
}

const DEFAULT_PAGE_NAME = "My Departures";

function createPageStore() {
  const initialRoutes = get(routeStore);
  const initial: PageStoreState = {
    pages: initialRoutes.length > 0 ? initialRoutes : [],
    activePageId: initialRoutes.length > 0 ? initialRoutes[0].id : null,
  };

  const { subscribe, set, update } = writable<PageStoreState>(initial);
  // Keep pageStore in sync when routeStore changes (e.g. addSegment, removeSegment)
  routeStore.subscribe((routes) => {
    update((state) => ({
      ...state,
      pages: routes,
    }));
  });
  // Derive the active page
  const activePage = derived({ subscribe }, ($state) => {
    if (!$state.activePageId && $state.pages.length > 0) {
      return $state.pages[0];
    }
    return (
      $state.pages.find((p) => p.id === $state.activePageId) ??
      $state.pages[0] ??
      null
    );
  });

  /** Create a new page with default direction */
  function createPage(name?: string): string {
    const pageName = name || getDefaultName();
    const id = routeStore.addRoute(pageName, "toWork");
    update((state) => {
      const pages = [
        ...state.pages,
        { id, name: pageName, direction: "toWork" as Direction, segments: [] },
      ];
      return { ...state, pages };
    });
    return id;
  }

  /** Rename a page */
  function renamePage(id: string, name: string): void {
    update((state) => {
      const pages = state.pages.map((p) => (p.id === id ? { ...p, name } : p));
      return { ...state, pages };
    });
  }

  /** Reorder pages */
  function reorderPages(fromIndex: number, toIndex: number): void {
    update((state) => {
      const pages = [...state.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      return { ...state, pages };
    });
  }

  /** Delete a page (minimum 1 guard) */
  function deletePage(id: string): void {
    update((state) => {
      if (state.pages.length <= 1) return state; // minimum 1 page guard
      const pages = state.pages.filter((p) => p.id !== id);
      let activePageId = state.activePageId;
      if (activePageId === id) {
        activePageId = pages.length > 0 ? pages[0].id : null;
      }
      return { ...state, pages, activePageId };
    });
  }

  /** Set active page */
  function setActivePage(id: string): void {
    update((state) => ({ ...state, activePageId: id }));
  }

  /** Get default page name */
  function getDefaultName(): string {
    const state = get({ subscribe });
    if (!state.pages.some((p) => p.name === DEFAULT_PAGE_NAME)) {
      return DEFAULT_PAGE_NAME;
    }
    let counter = 2;
    while (
      state.pages.some((p) => p.name === `${DEFAULT_PAGE_NAME} ${counter}`)
    ) {
      counter++;
    }
    return `${DEFAULT_PAGE_NAME} ${counter}`;
  }

  /** Sync pages from routeStore (call on initialization) */
  function syncFromRoutes(): void {
    const routes = get(routeStore);
    update((state) => {
      if (routes.length === 0) {
        // Create default page if no routes exist
        const id = routeStore.addRoute(DEFAULT_PAGE_NAME, "toWork");
        return {
          pages: [
            {
              id,
              name: DEFAULT_PAGE_NAME,
              direction: "toWork" as Direction,
              segments: [],
            },
          ],
          activePageId: id,
        };
      }
      return {
        pages: routes,
        activePageId:
          state.activePageId && routes.some((r) => r.id === state.activePageId)
            ? state.activePageId
            : routes[0].id,
      };
    });
  }

  // Initialize
  syncFromRoutes();

  return {
    subscribe,
    activePage,
    activePageId: derived({ subscribe }, ($state) => $state.activePageId),
    pages: derived({ subscribe }, ($state) => $state.pages),
    createPage,
    renamePage,
    reorderPages,
    deletePage,
    setActivePage,
    getDefaultName,
    syncFromRoutes,
  };
}

export const pageStore = createPageStore();

export const activePage = pageStore.activePage;
export const activePageId = pageStore.activePageId;
export const pages = pageStore.pages;
