import type { Departure, SiteSearchResult } from '../types/departure';

const JOURNEY_PLANNER_URL = 'https://journeyplanner.integration.sl.se/v2';
const TRANSPORT_URL = 'https://transport.integration.sl.se/v1';

const TRANSPORT_MODE_MAP: Record<number, string> = {
  0: 'bus',
  1: 'metro',
  2: 'train',
  3: 'tram',
  4: 'ship',
  5: 'ferry'
};

function mapProductClasses(classes: number[]): string[] {
  const modes = new Set<string>();
  for (const c of classes) {
    const mode = TRANSPORT_MODE_MAP[c];
    if (mode) modes.add(mode);
  }
  return modes.size > 0 ? Array.from(modes) : ['bus'];
}

export async function searchSites(query: string, transportMode?: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const params = new URLSearchParams({
    name_sf: query,
    any_obj_filter_sf: '2',
    type_sf: 'any'
  });
  
  const response = await fetch(`${JOURNEY_PLANNER_URL}/stop-finder?${params}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  let results = (data.locations || []).map((loc: any) => ({
    siteId: loc.id,
    name: loc.name || loc.desc,
    type: loc.type === 'stop' ? 'stop' : 'station',
    transportModes: mapProductClasses(loc.productClasses || [])
  }));
  
  if (transportMode && transportMode !== 'all') {
    results = results.filter((r: SiteSearchResult) => 
      r.transportModes?.includes(transportMode)
    );
  }
  
  return results.slice(0, 15);
}

export async function getDepartures(siteId: string): Promise<Departure[]> {
  const numericId = siteId.replace(/^\d{3}/, '').replace(/^9/, '');
  const response = await fetch(`${TRANSPORT_URL}/sites/${numericId}/departures`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return (data.departures || []).map((dep: any) => ({
    line: dep.line?.designation || dep.line?.name || '',
    destination: dep.destination || '',
    minutes: dep.timeToDeparture ?? dep.expected ? Math.max(0, Math.floor((new Date(dep.expected || dep.scheduled).getTime() - Date.now()) / 60000)) : 0,
    time: dep.scheduled || dep.expected || '',
    deviation: dep.deviation || dep.deviations?.[0]?.importance_level
  }));
}
