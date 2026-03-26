import { writable, derived, get } from 'svelte/store';
import type { Route, Segment, Direction, TransportType, Stop } from '../types/route';
import { loadRoutes, saveRoutes } from '../services/storage';

function createRouteStore() {
  const initial = loadRoutes();
  const { subscribe, set, update } = writable<Route[]>(initial);

  return {
    subscribe,
    getAll: () => get({ subscribe }),

    addRoute: (name: string, direction: Direction) => {
      const newRoute: Route = {
        id: crypto.randomUUID(),
        name,
        direction,
        segments: []
      };

      update(routes => {
        const updated = [...routes, newRoute];

        if (direction === 'toWork') {
          const reverseRoute: Route = {
            id: crypto.randomUUID(),
            name,
            direction: 'fromWork',
            segments: []
          };
          updated.push(reverseRoute);
        }

        saveRoutes(updated);
        return updated;
      });
    },

    removeRoute: (id: string) => {
      update(routes => {
        const routeToRemove = routes.find(r => r.id === id);
        const updated = routes.filter(r => r.id !== id);

        if (routeToRemove && routeToRemove.direction === 'toWork') {
          const remaining = updated.filter(r => r.name !== routeToRemove.name || r.direction !== 'fromWork');
          saveRoutes(remaining);
          return remaining;
        }

        saveRoutes(updated);
        return updated;
      });
    },

    addSegment: (routeId: string, segment: Omit<Segment, 'id'>) => {
      const newSegment: Segment = {
        ...segment,
        id: crypto.randomUUID()
      };

      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, segments: [...route.segments, newSegment] };
          }
          return route;
        });

        const route = routes.find(r => r.id === routeId);
        if (route && route.direction === 'toWork') {
          updated.forEach(r => {
            if (r.direction === 'fromWork' && r.name === route.name) {
              const newReversed: Segment = {
                id: crypto.randomUUID(),
                line: segment.line,
                lineName: segment.lineName,
                directionText: segment.directionText,
                fromStop: segment.toStop,
                toStop: segment.fromStop,
                transportType: segment.transportType
              };
              const reversedSegments = [newReversed, ...r.segments];
              r.segments = reversedSegments;
            }
          });
        }

        saveRoutes(updated);
        return updated;
      });
    },

    removeSegment: (routeId: string, segmentId: string) => {
      update(routes => {
        const route = routes.find(r => r.id === routeId);
        const updated = routes.map(r => {
          if (r.id === routeId) {
            return {
              ...r,
              segments: r.segments.filter(s => s.id !== segmentId)
            };
          }
          return r;
        });

        if (route && route.direction === 'toWork') {
          const segmentIndex = route.segments.findIndex(s => s.id === segmentId);
          if (segmentIndex >= 0) {
            updated.forEach(r => {
              if (r.direction === 'fromWork' && r.name === route.name) {
                r.segments = r.segments.filter((_, i) => i !== segmentIndex);
              }
            });
          }
        }

        saveRoutes(updated);
        return updated;
      });
    },

    reorderSegments: (routeId: string, fromIndex: number, toIndex: number) => {
      update(routes => {
        const route = routes.find(r => r.id === routeId);
        if (!route) return routes;
        
        const segments = [...route.segments];
        const [moved] = segments.splice(fromIndex, 1);
        segments.splice(toIndex, 0, moved);
        
        const updated = routes.map(r => {
          if (r.id === routeId) {
            return { ...r, segments };
          }
          return r;
        });
        
        if (route.direction === 'toWork') {
          const otherRoute = updated.find(r => r.direction === 'fromWork' && r.name === route.name);
          if (otherRoute) {
            const otherSegments = [...otherRoute.segments];
            const [otherMoved] = otherSegments.splice(fromIndex, 1);
            otherSegments.splice(toIndex, 0, otherMoved);
            
            return updated.map(r => {
              if (r.id === otherRoute.id) {
                return { ...r, segments: otherSegments };
              }
              return r;
            });
          }
        }
        
        saveRoutes(updated);
        return updated;
      });
    },

    initialize: () => {
      const stored = loadRoutes();
      if (stored.length === 0) {
        const toWork: Route = {
          id: crypto.randomUUID(),
          name: 'Arbete',
          direction: 'toWork',
          segments: []
        };
        const fromWork: Route = {
          id: crypto.randomUUID(),
          name: 'Arbete',
          direction: 'fromWork',
          segments: []
        };
        set([toWork, fromWork]);
        saveRoutes([toWork, fromWork]);
      }
    }
  };
}

export const routeStore = createRouteStore();
export const selectedRouteId = writable<string | null>(null);
export const selectedRoute = derived(
  [routeStore, selectedRouteId],
  ([$routes, $selectedId]) => {
    if (!$routes || $routes.length === 0) return null;
    return $selectedId ? $routes.find(r => r.id === $selectedId) : $routes[0];
  }
);