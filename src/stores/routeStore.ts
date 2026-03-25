import { writable, derived, get } from 'svelte/store';
import type { Route, Stop, TransportType } from '../types/route';
import { loadRoutes, saveRoutes } from '../services/storage';

function createRouteStore() {
  const { subscribe, set, update } = writable<Route[]>(loadRoutes());

  return {
    subscribe,
    addRoute: (name: string, transportType: TransportType = 'bus') => {
      const newRoute: Route = {
        id: crypto.randomUUID(),
        name,
        transportType,
        stops: []
      };
      update(routes => {
        const updated = [...routes, newRoute];
        saveRoutes(updated);
        return updated;
      });
    },
    removeRoute: (id: string) => {
      update(routes => {
        const updated = routes.filter(r => r.id !== id);
        saveRoutes(updated);
        return updated;
      });
    },
    updateRouteTransport: (id: string, transportType: TransportType) => {
      update(routes => {
        const updated = routes.map(r => 
          r.id === id ? { ...r, transportType } : r
        );
        saveRoutes(updated);
        return updated;
      });
    },
    addStop: (routeId: string, stop: Stop) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops: [...route.stops, stop] };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    removeStop: (routeId: string, stopId: string) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops: route.stops.filter(s => s.id !== stopId) };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    reorderStops: (routeId: string, stops: Stop[]) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    setTravelTime: (routeId: string, stopIndex: number, minutes: number) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            const newStops = [...route.stops];
            newStops[stopIndex] = { ...newStops[stopIndex], travelMinutesToNext: minutes };
            return { ...route, stops: newStops };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    initialize: () => {
      const stored = loadRoutes();
      if (stored.length === 0) {
        const defaultRoutes: Route[] = [
          { id: crypto.randomUUID(), name: 'Jobb', transportType: 'metro', stops: [] },
          { id: crypto.randomUUID(), name: 'Hem', transportType: 'bus', stops: [] }
        ];
        set(defaultRoutes);
        saveRoutes(defaultRoutes);
      }
    }
  };
}

export const routeStore = createRouteStore();
export const selectedRouteId = writable<string | null>(null);
export const selectedRoute = derived(
  [routeStore, selectedRouteId],
  ([$routes, $selectedId]) => $selectedId ? $routes.find(r => r.id === $selectedId) : $routes[0]
);
