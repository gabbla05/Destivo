import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGoogleApiKey, hasValidGoogleApiKey } from './config';

export { getGoogleApiKey, hasValidGoogleApiKey };

/**
 * Zdjęcia miejsc pobierane WYŁĄCZNIE na żywo z Google Places.
 *
 * - W kodzie nie ma żadnych zaszytych zdjęć ani odwołań `photo_reference` (Google traktuje je
 *   jako tymczasowe - po pewnym czasie wygasają i zwracają błąd 400).
 * - Pobrane odwołania zapamiętujemy (pamięć + AsyncStorage) na PHOTO_TTL_MS, żeby nie płacić
 *   wielokrotnie za te same zapytania. Brak zdjęcia zapamiętujemy krócej (MISS_TTL_MS).
 * - W pamięci trzymamy samo `photo_reference`, a adres URL budujemy przy odczycie, dzięki czemu
 *   zmiana klucza API nie psuje zapamiętanych zdjęć.
 * - Gdy Google nie ma zdjęcia, funkcje zwracają null, a interfejs pokazuje neutralny placeholder.
 */

const CACHE_STORAGE_KEY = '@destivo_places_photos_v3';
/** Starsze wersje pamięci zawierały wygasłe odwołania - usuwamy je przy pierwszym odczycie. */
const LEGACY_CACHE_KEYS = ['@destivo_places_photos_v2', '@destivo_places_photos_v1', '@destivo_places_photos'];

export const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

interface CacheEntry {
  /** photo_reference z Google lub null, gdy miejsce nie ma zdjęcia. */
  ref: string | null;
  /** Szerokość, z którą budujemy URL. */
  width: number;
  /** Znacznik czasu zapisu (ms). */
  ts: number;
}

const MEMORY_CACHE = new Map<string, CacheEntry>();
let hydrationPromise: Promise<void> | null = null;

const isUsableKey = (key: string) => Boolean(key && key.trim().length > 5 && !key.includes('TYMCZASOWY'));

export function buildGooglePlacesPhotoUrl(
  photoRef: string,
  apiKey: string = getGoogleApiKey(),
  maxWidth: number = 1000
): string {
  return (
    'https://maps.googleapis.com/maps/api/place/photo?maxwidth=' +
    maxWidth +
    '&photo_reference=' +
    photoRef +
    '&key=' +
    apiKey
  );
}

const normalize = (value?: string) => (value || '').trim().toLowerCase();
const cityCacheKey = (city: string, country = '') => `city__${normalize(city)}__${normalize(country)}`;
const placeCacheKey = (place: string, city = '') => `place__${normalize(place)}__${normalize(city)}`;

const isFresh = (entry: CacheEntry, now = Date.now()) =>
  now - entry.ts < (entry.ref ? PHOTO_TTL_MS : MISS_TTL_MS);

function hydrateCacheIfNeeded(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        await AsyncStorage.multiRemove(LEGACY_CACHE_KEYS);
      } catch {}
      try {
        const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const now = Date.now();
        Object.entries(parsed || {}).forEach(([key, value]: [string, any]) => {
          if (
            value &&
            typeof value.ts === 'number' &&
            typeof value.width === 'number' &&
            (typeof value.ref === 'string' || value.ref === null)
          ) {
            const entry: CacheEntry = { ref: value.ref, width: value.width, ts: value.ts };
            if (isFresh(entry, now)) MEMORY_CACHE.set(key, entry);
          }
        });
      } catch (e) {
        console.warn('Błąd odczytu pamięci zdjęć:', e);
      }
    })();
  }
  return hydrationPromise;
}

async function persistCache() {
  try {
    const obj: Record<string, CacheEntry> = {};
    const now = Date.now();
    MEMORY_CACHE.forEach((entry, key) => {
      if (isFresh(entry, now)) obj[key] = entry;
    });
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Błąd zapisu pamięci zdjęć:', e);
  }
}

/** Zwraca wpis z pamięci, jeśli jest aktualny. `undefined` = brak informacji, trzeba zapytać Google. */
function readCache(key: string): CacheEntry | undefined {
  const entry = MEMORY_CACHE.get(key);
  if (!entry) return undefined;
  if (!isFresh(entry)) {
    MEMORY_CACHE.delete(key);
    return undefined;
  }
  return entry;
}

function writeCache(key: string, ref: string | null, width: number) {
  MEMORY_CACHE.set(key, { ref, width, ts: Date.now() });
  persistCache().catch(() => {});
}

function entryToUrl(entry: CacheEntry, apiKey: string): string | null {
  return entry.ref ? buildGooglePlacesPhotoUrl(entry.ref, apiKey, entry.width) : null;
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const firstPhotoRef = (items: any[]): string | null => {
  const withPhoto = items.find((item) => Array.isArray(item?.photos) && item.photos[0]?.photo_reference);
  return withPhoto ? withPhoto.photos[0].photo_reference : null;
};

/**
 * Szuka miejsca w Google Places (najpierw Find Place, potem Text Search) i zwraca
 * `photo_reference` pierwszego wyniku ze zdjęciem.
 * - string: znaleziono zdjęcie,
 * - null: Google odpowiedział, ale miejsce nie ma zdjęcia (można to zapamiętać),
 * - undefined: błąd sieci / klucza (nie zapamiętujemy, spróbujemy następnym razem).
 */
async function lookupPhotoRef(query: string, apiKey: string): Promise<string | null | undefined> {
  const findUrl =
    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=' +
    encodeURIComponent(query) +
    '&inputtype=textquery&fields=photos,name,place_id&key=' +
    apiKey;
  const findData = await fetchJson(findUrl);
  if (findData?.status !== 'OK' && findData?.status !== 'ZERO_RESULTS') {
    // REQUEST_DENIED, OVER_QUERY_LIMIT itp. - nie zapamiętujemy porażki
    return undefined;
  }
  const findRef = Array.isArray(findData.candidates) ? firstPhotoRef(findData.candidates) : null;
  if (findRef) return findRef;

  const textUrl =
    'https://maps.googleapis.com/maps/api/place/textsearch/json?query=' +
    encodeURIComponent(query) +
    '&key=' +
    apiKey;
  const textData = await fetchJson(textUrl);
  if (textData?.status === 'OK' && Array.isArray(textData.results)) {
    return firstPhotoRef(textData.results);
  }
  return textData?.status === 'ZERO_RESULTS' ? null : undefined;
}

async function getPhoto(cacheKey: string, query: string, width: number, label: string): Promise<string | null> {
  await hydrateCacheIfNeeded();
  const apiKey = getGoogleApiKey();
  if (!isUsableKey(apiKey)) return null;

  const cached = readCache(cacheKey);
  if (cached) return entryToUrl(cached, apiKey);

  try {
    const ref = await lookupPhotoRef(query, apiKey);
    if (ref === undefined) return null;
    writeCache(cacheKey, ref, width);
    return ref ? buildGooglePlacesPhotoUrl(ref, apiKey, width) : null;
  } catch (e) {
    console.warn(`[Places Photo] Błąd dla ${label}:`, e);
    return null;
  }
}

/** Zdjęcie miasta / miejscowości z Google Places (lub null). */
export async function fetchGoogleCityPhoto(cityName: string, countryName: string = ''): Promise<string | null> {
  if (!cityName || !cityName.trim()) return null;
  const query = countryName ? `${cityName.trim()} ${countryName.trim()}` : cityName.trim();
  return getPhoto(cityCacheKey(cityName, countryName), query, 1000, cityName);
}

/** Zdjęcie konkretnej atrakcji z Google Places, szukanej po nazwie i mieście (lub null). */
export async function fetchGooglePlacePhoto(placeName: string, destinationCity: string = ''): Promise<string | null> {
  if (!placeName || !placeName.trim()) return null;
  const query = `${placeName.trim()} ${destinationCity.trim()}`.trim();
  return getPhoto(placeCacheKey(placeName, destinationCity), query, 800, placeName);
}

/**
 * Zwraca zapamiętane zdjęcie miasta BEZ odpytywania sieci (np. przy szybkim wczytaniu
 * listy z pamięci). Pusty string, gdy nic aktualnego nie mamy.
 */
export async function getCachedCityPhoto(cityName: string, countryName: string = ''): Promise<string> {
  if (!cityName || !cityName.trim()) return '';
  await hydrateCacheIfNeeded();
  const apiKey = getGoogleApiKey();
  if (!isUsableKey(apiKey)) return '';
  const cached = readCache(cityCacheKey(cityName, countryName));
  return (cached && entryToUrl(cached, apiKey)) || '';
}

/**
 * Czy adres zdjęcia zapisany wcześniej (np. w starej podróży) można dalej pokazywać.
 * Odrzucamy zdjęcia z banków zdjęć wpisane kiedyś na sztywno oraz adresy Google Places Photo,
 * bo zawarte w nich odwołania wygasają - takie zdjęcia pobieramy na nowo.
 */
export function isReusablePhotoUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('images.unsplash.com')) return false;
  if (url.includes('maps.googleapis.com/maps/api/place/photo')) return false;
  return /^(https?:|file:|content:|data:)/.test(url);
}

/**
 * Uzupełnia listę atrakcji o aktualne zdjęcia z Google Places.
 * Atrakcja zachowuje własne zdjęcie tylko wtedy, gdy nie jest to stare zdjęcie zastępcze
 * ani wygasające odwołanie Google (patrz `isReusablePhotoUrl`).
 */
export async function enrichAttractionsWithGooglePhotos<T extends { name: string; imageUrl?: string }>(
  attractions: T[],
  destinationCity: string = ''
): Promise<T[]> {
  if (!Array.isArray(attractions) || attractions.length === 0) return attractions;

  return Promise.all(
    attractions.map(async (attr) => {
      if (isReusablePhotoUrl(attr.imageUrl)) return attr;
      try {
        const photo = await fetchGooglePlacePhoto(attr.name, destinationCity);
        if (photo) return { ...attr, imageUrl: photo };
      } catch {}
      // Brak zdjęcia: czyścimy nieaktualny adres, żeby interfejs pokazał placeholder
      return attr.imageUrl ? { ...attr, imageUrl: undefined } : attr;
    })
  );
}

/** Tylko do testów: czyści pamięć zdjęć. */
export function __resetPlacesPhotoCacheForTests() {
  MEMORY_CACHE.clear();
  hydrationPromise = null;
}
