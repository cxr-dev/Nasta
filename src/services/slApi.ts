import type { Departure, SiteSearchResult } from '../types/departure';

const BASE_URL = 'https://transport.integration.sl.se/v1';

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const response = await fetch(`${BASE_URL}/sites?search=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return data.map((site: any) => ({
    siteId: site.siteId,
    name: site.name,
    type: site.type || 'stop'
  }));
}

export async function getDepartures(siteId: string): Promise<Departure[]> {
  const response = await fetch(`${BASE_URL}/sites/${siteId}/departures`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return data.departures.map((dep: any) => ({
    line: dep.line,
    destination: dep.destination,
    minutes: dep.timeToDeparture,
    time: dep.plannedDepartureTime,
    deviation: dep.deviation
  }));
}
