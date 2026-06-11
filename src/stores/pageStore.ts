import { writable, derived, get } from "svelte/store";
import type { Page } from "../types/route";
import { routeStore } from "./routeStore";

interface PageStoreState {
  pages: Page[];
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

  /** Create a new page */
  function createPage(name?: string): string {
    const pageName = name || getDefaultName();
    return routeStore.addRoute(pageName);
  }

  /** Rename a page */
  function renamePage(id: string, name: string): void {
    routeStore.renameRoute(id, name);
  }

  /** Reorder pages */
  function reorderPages(fromIndex: number, toIndex: number): void {
    routeStore.reorderRoutes(fromIndex, toIndex);
  }

  /** Delete a page (minimum 1 guard) */
  function deletePage(id: string): void {
    const state = get({ subscribe });
    if (state.pages.length <= 1) return;
    routeStore.removeRoute(id);
    if (state.activePageId === id) {
      const nextId = state.pages.find(p => p.id !== id)?.id ?? null;
      if (nextId) {
        setActivePage(nextId);
      }
    }
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
        const id = routeStore.addRoute(DEFAULT_PAGE_NAME);
        return {
          pages: [
            {
              id,
              name: DEFAULT_PAGE_NAME,
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
