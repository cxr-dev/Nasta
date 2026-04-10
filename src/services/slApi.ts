import type { Departure, SiteSearchResult } from '../types/departure';
import type { TransportType } from '../types/route';
import { learnFromApiResponse } from './timetableCache';

const TRANSPORT_URL = 'https://transport.integration.sl.se/v1';

function getTransportType(mode?: string): TransportType {
  switch (mode?.toLowerCase()) {
    case 'bus': return 'bus';
    case 'train': case 'rail': return 'train';
    case 'metro': return 'metro';
    case 'boat': case 'ferry': return 'boat';
    default: return 'bus';
  }
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function rankByRelevance(stations: SiteSearchResult[], query: string): SiteSearchResult[] {
  const q = query.toLowerCase().trim();
  const nq = norm(query);
  return stations
    .map(s => {
      const name = s.name.toLowerCase();
      const nname = norm(s.name);
      let score: number;
      if (name === q || nname === nq)                              score = 4; // exact
      else if (name.startsWith(q) || nname.startsWith(nq))        score = 3; // prefix
      else if (name.includes(q) || nname.includes(nq))            score = 2; // contains
      else                                                         score = 1; // API fuzzy match
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
}

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];

  const response = await fetch(
    `${TRANSPORT_URL}/sites?expand=true&query=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  const stations: SiteSearchResult[] = (Array.isArray(data) ? data : []).map((site: any) => ({
    siteId: String(site.id),
    name: site.name,
    note: site.note || '',
    type: 'stop' as const,
    lat: site.lat,
    lon: site.lon
  }));

  return rankByRelevance(stations, query);
}

export async function getDepartures(siteId: string, forecast = 240): Promise<Departure[]> {
  const response = await fetch(`${TRANSPORT_URL}/sites/${siteId}/departures?forecast=${forecast}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  learnFromApiResponse(siteId, data.departures || []);

  return (data.departures || []).map((dep: any) => {
    let minutes = dep.timeToDeparture;
    if (minutes === undefined && dep.expected) {
      minutes = Math.max(0, Math.floor((new Date(dep.expected).getTime() - Date.now()) / 60000));
    }
    const scheduledTime = dep.scheduled || dep.expected || '';
    const formattedTime = scheduledTime ? formatTime(new Date(scheduledTime)) : '';
    return {
      line: dep.line?.designation || dep.line?.name || '',
      lineName: dep.line?.name || '',
      destination: dep.destination || '',
      directionText: dep.direction || '',
      minutes: minutes ?? 0,
      time: formattedTime,
      expectedAt: dep.expected ? new Date(dep.expected).getTime() : undefined,
      deviation: dep.deviation,
      transportType: getTransportType(dep.line?.transportMode),
      // SL API exposes journey.id — used for vehicle position estimation in the progress strip
      journeyRef: dep.journey?.id != null ? String(dep.journey.id) : undefined,
    };
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
