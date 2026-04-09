import type { Departure, SiteSearchResult } from '../types/departure';
import type { TransportType } from '../types/route';

const TRANSPORT_URL = 'https://transport.integration.sl.se/v1';

const STORAGE_KEY = 'nasta_stations';
const CACHE_DURATION = 24 * 60 * 60 * 1000;

interface CachedData {
  stations: SiteSearchResult[];
  timestamp: number;
}

function getTransportType(mode?: string): TransportType {
  switch (mode?.toLowerCase()) {
    case 'bus': return 'bus';
    case 'train': case 'rail': return 'train';
    case 'metro': return 'metro';
    case 'boat': case 'ferry': return 'boat';
    default: return 'bus';
  }
}

function fuzzyMatch(text: string, searchTerm: string): boolean {
  const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizedSearch = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (normalizedText.includes(normalizedSearch)) return true;
  
  let searchIdx = 0;
  for (let i = 0; i < normalizedText.length && searchIdx < normalizedSearch.length; i++) {
    if (normalizedText[i] === normalizedSearch[searchIdx]) {
      searchIdx++;
    }
  }
  return searchIdx === normalizedSearch.length;
}

function filterStations(stations: SiteSearchResult[], query: string): SiteSearchResult[] {
  const q = query.toLowerCase();
  const normalizedQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const exact = stations.filter(s => s.name.toLowerCase() === q);
  const startsWith = stations.filter(s => !exact.includes(s) && s.name.toLowerCase().startsWith(q));
  const exactPartial = stations.filter(s => !exact.includes(s) && !startsWith.includes(s) && s.name.toLowerCase().includes(q));
  const partialNormalized = stations.filter(s => !exact.includes(s) && !startsWith.includes(s) && !exactPartial.includes(s) && 
    s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalizedQ));
  const fuzzy = stations.filter(s => !exact.includes(s) && !startsWith.includes(s) && !exactPartial.includes(s) && !partialNormalized.includes(s) && fuzzyMatch(s.name, query));
  
  return [...exact, ...startsWith, ...exactPartial, ...partialNormalized, ...fuzzy].slice(0, 12);
}

function getCachedStations(): SiteSearchResult[] | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return null;
    
    const data: CachedData = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data.stations;
  } catch {
    return null;
  }
}

function setCachedStations(stations: SiteSearchResult[]) {
  try {
    const data: CachedData = {
      stations,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage not available
  }
}

export async function loadStations(): Promise<SiteSearchResult[]> {
  const cached = getCachedStations();
  if (cached) return cached;
  
  const response = await fetch(`${TRANSPORT_URL}/sites?expand=true`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  const stations: SiteSearchResult[] = data.map((site: any) => ({
    siteId: String(site.id),
    name: site.name,
    note: site.note || '',
    type: 'stop' as const,
    lat: site.lat,
    lon: site.lon
  }));
  
  setCachedStations(stations);
  return stations;
}

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const stations = await loadStations();
  return filterStations(stations, query);
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
