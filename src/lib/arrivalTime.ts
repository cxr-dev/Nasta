import type { Route } from '../types/route';
import type { Departure } from '../stores/departureStore';

export function computeArrivalTime(
  route: Route,
  departures: Map<string, Departure[]>
): string | null {
  if (!route || route.segments.length === 0) return null;

  const firstSeg = route.segments[0];
  const firstDeps = (departures.get(firstSeg.fromStop.siteId) ?? []).filter(
    d => d.line === firstSeg.line && d.destination === firstSeg.directionText
  );

  if (firstDeps.length === 0) return null;

  const waitMinutes = firstDeps[0].minutes;
  const travelMinutes = route.segments.reduce(
    (sum, s) => sum + (s.travelTimeMinutes ?? 0), 0
  );

  const totalMinutes = waitMinutes + travelMinutes;
  const arrivalMs = Date.now() + totalMinutes * 60 * 1000;
  const d = new Date(arrivalMs);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
