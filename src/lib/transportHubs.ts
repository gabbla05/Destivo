import { getGoogleApiKey } from './config';
import { resolveCoordinates, calculateDistanceKm } from './geoDatabase';

/**
 * Lotniska i dworce kolejowe w pobliżu miejscowości (Google Places Nearby Search) —
 * do wyboru z listy zamiast ręcznego wpisywania miejsca odjazdu i przyjazdu.
 * Google zwraca dla typu "airport" także parkingi, wypożyczalnie czy lądowiska, dlatego wyniki
 * są filtrowane: zostają wyłącznie prawdziwe porty lotnicze i stacje kolejowe.
 */

export type HubKind = 'airport' | 'train_station';

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
    case 'car':
    case 'bus':
      return [];
    default:
      return ['train_station'];
  }
}

const cache = new Map<string, TransportHub[]>();

/** Sortowanie po popularności: na górze duże porty i dworce główne (Kraków Główny, Warszawa Centralna). */
const SEARCH: Record<HubKind, { radius: number; byPopularity: boolean; limit: number }> = {
  airport: { radius: 80000, byPopularity: true, limit: 6 },
  train_station: { radius: 15000, byPopularity: true, limit: 8 },
};

/** Miejsca "przy lotnisku / dworcu", które nie są węzłem: parkingi, wypożyczalnie, hotele, taxi… */
const NOT_A_HUB_NAME = /parking|\bp\s*\+\s*r\b|park\s*&\s*ride|\brent|wypo[żz]ycz|hotel|taxi|transfer|cargo|l[ąa]dowisko|aeroklub|airfield|heliport|szko[łl]a|school|kantor|sklep|\bshop|restaur|caf[eé]|kawiarn|biuro|office|agency|\bcar\b|samoch|airport city|business|logistic|baza lotnicza|air base/i;
const NOT_A_HUB_TYPE = ['parking', 'lodging', 'car_rental', 'travel_agency', 'restaurant', 'cafe', 'store', 'taxi_stand', 'gas_station', 'shopping_mall', 'car_repair'];
/** Nazwa portu lotniczego w popularnych językach (w tym nazwy lotnisk w Europie). */
const AIRPORT_NAME = /airport|lotnisko|port lotniczy|a[ée]roport|aeropuerto|aeroporto|flughafen|leti[šs]t[ěe]|rep[üu]l[őo]t[ée]r|lufthavn|flygplats|lentoasema|havaliman|luchthaven|lennujaam|oro uostas|lidosta|aerodrom/i;
/** Duże porty mają kilkanaście–kilkadziesiąt tysięcy opinii; lotniska sportowe i lądowiska — najwyżej kilkaset. */
const MIN_AIRPORT_RATINGS = 2000;

export function isRealHub(result: any, kind: HubKind): boolean {
  const name = String(result?.name || '');
  const types: string[] = Array.isArray(result?.types) ? result.types : [];
  if (!name || NOT_A_HUB_NAME.test(name)) return false;
  if (types.some((t) => NOT_A_HUB_TYPE.includes(t))) return false;
  if (kind === 'airport') {
    return types.includes('airport') && AIRPORT_NAME.test(name) && (Number(result?.user_ratings_total) || 0) >= MIN_AIRPORT_RATINGS;
  }
  // Tylko stacje kolejowe - typ transit_station obejmuje też przystanki tramwajowe i autobusowe
  return types.includes('train_station');
}

async function searchKind(lat: number, lon: number, kind: HubKind, key: string, language: string): Promise<TransportHub[]> {
  const cfg = SEARCH[kind];
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}` +
    `&radius=${cfg.radius}&type=${kind}&language=${language}&key=${key}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const hubs = results
      .filter((r) => typeof r?.geometry?.location?.lat === 'number' && isRealHub(r, kind))
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
export async function findNearbyHubs(
  place: string,
  transportType?: string | null,
  language: 'pl' | 'en' = 'pl'
): Promise<TransportHub[]> {
  const kinds = hubKindsForTransport(transportType);
  const query = (place || '').trim();
  if (!query || kinds.length === 0) return [];

  const cacheKey = `${query.toLowerCase()}|${kinds.join(',')}|${language}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const key = getGoogleApiKey();
  if (!key) return [];
  const coords = await resolveCoordinates(query).catch(() => null);
  if (!coords) return [];

  const lists = await Promise.all(kinds.map((kind) => searchKind(coords.lat, coords.lon, kind, key, language)));
  // Ta sama stacja bywa w Google kilka razy ("Warszawa Centralna", "... Train Station") -
  // pomijamy powtórzoną nazwę i miejsca leżące do 150 m od już wybranego (Warszawa Centralna i
  // Śródmieście dzieli ok. 300 m, więc większy próg usuwałby prawdziwe stacje)
  const hubs: TransportHub[] = [];
  for (const h of lists.flat()) {
    const duplicate = hubs.some(
      (k) => k.name.toLowerCase() === h.name.toLowerCase() || calculateDistanceKm(k.lat, k.lon, h.lat, h.lon) < 0.15
    );
    if (!duplicate) hubs.push(h);
  }
  if (hubs.length > 0) cache.set(cacheKey, hubs);
  return hubs;
}

/** Tylko do testów. */
export function __resetTransportHubsCache() {
  cache.clear();
}
