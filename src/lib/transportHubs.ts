import { getGoogleApiKey } from './config';
import { resolveCoordinates, calculateDistanceKm } from './geoDatabase';

/**
 * Dworce, lotniska i przystanki w pobliżu miejscowości (Google Places Nearby Search) —
 * do wyboru z listy zamiast ręcznego wpisywania miejsca odjazdu i przyjazdu.
 */

export type HubKind = 'airport' | 'train_station' | 'bus_station';

export interface TransportHub {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distanceKm: number;
  kind: HubKind;
}

/** Jakich miejsc szukać dla danego środka transportu. Samochód nie ma węzła (start spod domu). */
export function hubKindsForTransport(transportType?: string | null): HubKind[] {
  switch ((transportType || '').toLowerCase()) {
    case 'flight':
    case 'plane':
      return ['airport'];
    case 'train':
      return ['train_station'];
    case 'bus':
      return ['bus_station'];
    case 'car':
      return [];
    default:
      return ['train_station', 'bus_station'];
  }
}

const cache = new Map<string, TransportHub[]>();

/** Lotniska szukamy szerzej i sortujemy po popularności (duże porty, nie lądowiska). */
const SEARCH: Record<HubKind, { radius: number; byPopularity: boolean; limit: number }> = {
  airport: { radius: 80000, byPopularity: true, limit: 6 },
  train_station: { radius: 15000, byPopularity: false, limit: 8 },
  bus_station: { radius: 15000, byPopularity: false, limit: 6 },
};

async function searchKind(lat: number, lon: number, kind: HubKind, key: string): Promise<TransportHub[]> {
  const cfg = SEARCH[kind];
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}` +
    `&radius=${cfg.radius}&type=${kind}&key=${key}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const hubs = results
      .filter((r) => typeof r?.geometry?.location?.lat === 'number' && r?.name)
      .map((r) => ({
        hub: {
          id: String(r.place_id || `${kind}-${r.name}`),
          name: String(r.name),
          address: String(r.vicinity || r.formatted_address || ''),
          lat: r.geometry.location.lat,
          lon: r.geometry.location.lng,
          distanceKm: Math.round(calculateDistanceKm(lat, lon, r.geometry.location.lat, r.geometry.location.lng) * 10) / 10,
          kind,
        } as TransportHub,
        popularity: Number(r.user_ratings_total) || 0,
      }));
    hubs.sort((a, b) => (cfg.byPopularity ? b.popularity - a.popularity : a.hub.distanceKm - b.hub.distanceKm));
    return hubs.slice(0, cfg.limit).map((h) => h.hub);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Węzły transportowe w pobliżu miejscowości. Pusta lista oznacza brak wyników albo brak sieci —
 * użytkownik może zawsze wpisać miejsce ręcznie.
 */
export async function findNearbyHubs(place: string, transportType?: string | null): Promise<TransportHub[]> {
  const kinds = hubKindsForTransport(transportType);
  const query = (place || '').trim();
  if (!query || kinds.length === 0) return [];

  const cacheKey = `${query.toLowerCase()}|${kinds.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const key = getGoogleApiKey();
  if (!key) return [];
  const coords = await resolveCoordinates(query).catch(() => null);
  if (!coords) return [];

  const lists = await Promise.all(kinds.map((kind) => searchKind(coords.lat, coords.lon, kind, key)));
  const seen = new Set<string>();
  const hubs = lists.flat().filter((h) => {
    const k = h.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (hubs.length > 0) cache.set(cacheKey, hubs);
  return hubs;
}

/** Tylko do testów. */
export function __resetTransportHubsCache() {
  cache.clear();
}
