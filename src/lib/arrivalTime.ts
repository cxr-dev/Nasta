import type { Route, Segment } from '../types/route';
import type { Departure } from '../stores/departureStore';

export interface ArrivalSummary {
  time: string;
  transferSlackMinutes: number | null;
  transferState: 'tight' | 'normal' | 'comfortable' | null;
}

function departureTimestamp(dep: Departure, now: number): number {
  return dep.expectedAt ?? (now + dep.minutes * 60_000);
}

function matchingDepartures(
  segment: Segment,
  departures: Map<string, Departure[]>,
  now: number
): Departure[] {
  return (departures.get(segment.fromStop.siteId) ?? [])
    .filter(d => d.line === segment.line && d.directionText === segment.directionText)
    .sort((a, b) => departureTimestamp(a, now) - departureTimestamp(b, now));
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function computeArrivalSummary(
  route: Route,
  departures: Map<string, Departure[]>,
  now = Date.now()
): ArrivalSummary | null {
  if (!route || route.segments.length === 0) return null;

  let readyAt = now;
  let arrivalAt: number | null = null;
  let minTransferSlackMinutes: number | null = null;

  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i];
    const nextDeparture = matchingDepartures(segment, departures, now)
      .find(dep => departureTimestamp(dep, now) >= readyAt);

    if (!nextDeparture) return null;

    const boardedAt = departureTimestamp(nextDeparture, now);

    if (i > 0) {
      const slackMinutes = Math.max(0, Math.floor((boardedAt - readyAt) / 60_000));
      minTransferSlackMinutes = minTransferSlackMinutes === null
        ? slackMinutes
        : Math.min(minTransferSlackMinutes, slackMinutes);
    }

    arrivalAt = boardedAt + (segment.travelTimeMinutes ?? 0) * 60_000;
    readyAt = arrivalAt + (segment.transferBufferMinutes ?? 0) * 60_000;
  }

  if (arrivalAt === null) return null;

  let transferState: ArrivalSummary['transferState'] = null;
  if (minTransferSlackMinutes !== null) {
    if (minTransferSlackMinutes <= 3) transferState = 'tight';
    else if (minTransferSlackMinutes >= 8) transferState = 'comfortable';
    else transferState = 'normal';
  }

  return {
    time: formatClock(arrivalAt),
    transferSlackMinutes: minTransferSlackMinutes,
    transferState,
  };
}
