import type { Departure, SiteSearchResult } from '../types/departure';
import type { TransportType } from '../types/route';

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

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];

  const response = await fetch(
    `${TRANSPORT_URL}/sites?expand=true&query=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  return (Array.isArray(data) ? data : []).map((site: any) => ({
    siteId: String(site.id),
    name: site.name,
    note: site.note || '',
    type: 'stop' as const,
    lat: site.lat,
    lon: site.lon
  }));
}

export async function getDepartures(siteId: string): Promise<Departure[]> {
  const response = await fetch(`${TRANSPORT_URL}/sites/${siteId}/departures`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
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
      transportType: getTransportType(dep.line?.transportMode)
    };
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
