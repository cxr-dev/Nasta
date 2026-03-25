import type { Departure, SiteSearchResult } from '../types/departure';
import type { TransportType } from '../types/route';

const TRAFIKLAB_BASE = 'https://transport.trafiklab.se/api2/v1';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const API_BASE = WORKER_URL ? `${WORKER_URL}/api` : TRAFIKLAB_BASE;

function getTransportType(mode?: string): TransportType {
  switch (mode?.toUpperCase()) {
    case 'BUS': return 'bus';
    case 'TRAIN': case 'RAIL': case 'TRAM': return 'train';
    case 'METRO': return 'metro';
    case 'BOAT': case 'SHIP': return 'boat';
    default: return 'bus';
  }
}

export async function searchStops(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const url = `${API_BASE}/stops/name/${encodeURIComponent(query)}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  return (data.stops || []).map((stop: any) => ({
    siteId: stop.stopId || stop.id,
    name: stop.name,
    type: 'stop' as const,
    lat: stop.lat,
    lon: stop.lon
  }));
}

export async function getDepartures(stopId: string): Promise<Departure[]> {
  const url = `${API_BASE}/timetable/${encodeURIComponent(stopId)}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  return (data.Departures || []).map((dep: any) => {
    let minutes = dep.minutes;
    if (minutes === undefined && dep.departureTime) {
      minutes = Math.max(0, Math.floor((new Date(dep.departureTime).getTime() - Date.now()) / 60000));
    }
    return {
      line: dep.lineNumber || dep.line || '',
      lineName: dep.linePublicName || dep.lineName || '',
      destination: dep.destination || '',
      directionText: dep.destination || '',
      minutes: minutes ?? 0,
      time: dep.departureTime || dep.scheduled || '',
      deviation: dep.deviation,
      transportType: getTransportType(dep.transportMode)
    };
  });
}
