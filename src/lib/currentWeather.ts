import { getWeatherApiKey } from './config';
import { resolveCoordinates } from './geoDatabase';

/**
 * Bieżąca pogoda w miejscu podróży (OpenWeatherMap /data/2.5/weather).
 * Brak klucza, sieci albo danych -> null, a interfejs w ogóle nie pokazuje plakietki pogody.
 */

export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'snow' | 'storm' | 'fog';

export interface CurrentWeather {
  tempC: number;
  condition: WeatherCondition;
  /** Nazwa ikony Ionicons odpowiadająca warunkom. */
  icon: 'sunny' | 'partly-sunny' | 'cloudy' | 'rainy' | 'snow' | 'thunderstorm' | 'cloud';
}

export const CURRENT_WEATHER_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

const cache = new Map<string, { value: CurrentWeather; ts: number }>();

/** Grupy kodów pogody OpenWeatherMap: https://openweathermap.org/weather-conditions */
export function mapWeatherCode(code: number, cloudiness = 0): Pick<CurrentWeather, 'condition' | 'icon'> {
  if (code >= 200 && code < 300) return { condition: 'storm', icon: 'thunderstorm' };
  if (code >= 300 && code < 600) return { condition: 'rain', icon: 'rainy' };
  if (code >= 600 && code < 700) return { condition: 'snow', icon: 'snow' };
  if (code >= 700 && code < 800) return { condition: 'fog', icon: 'cloud' };
  if (code === 800) return { condition: 'clear', icon: 'sunny' };
  if (code === 801 || code === 802 || cloudiness < 50) return { condition: 'clouds', icon: 'partly-sunny' };
  return { condition: 'clouds', icon: 'cloudy' };
}

export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const apiKey = getWeatherApiKey();
  if (!apiKey) return null;

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CURRENT_WEATHER_TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const temp = data?.main?.temp;
    const code = data?.weather?.[0]?.id;
    if (typeof temp !== 'number' || typeof code !== 'number') return null;

    const value: CurrentWeather = {
      tempC: Math.round(temp),
      ...mapWeatherCode(code, typeof data?.clouds?.all === 'number' ? data.clouds.all : 0),
    };
    cache.set(key, { value, ts: Date.now() });
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Współrzędne do pogody: najpierw nocleg, potem cel podróży. */
export async function resolveTripWeatherCoordinates(trip: any): Promise<{ lat: number; lon: number } | null> {
  if (!trip) return null;
  let lodgingAddress = '';
  try {
    const lodging = typeof trip.lodging_data === 'string' ? JSON.parse(trip.lodging_data || '{}') : trip.lodging_data || {};
    lodgingAddress = (lodging.lodgingAddress || lodging.address || trip.accommodation_address || '').trim();
  } catch {
    lodgingAddress = (trip.accommodation_address || '').trim();
  }

  for (const query of [lodgingAddress, (trip.destination || '').trim()]) {
    if (!query) continue;
    try {
      const coords = await resolveCoordinates(query);
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) return coords;
    } catch {}
  }
  return null;
}

export async function fetchTripCurrentWeather(trip: any): Promise<CurrentWeather | null> {
  const coords = await resolveTripWeatherCoordinates(trip);
  return coords ? fetchCurrentWeather(coords.lat, coords.lon) : null;
}

/** Tylko do testów. */
export function __resetCurrentWeatherCacheForTests() {
  cache.clear();
}
