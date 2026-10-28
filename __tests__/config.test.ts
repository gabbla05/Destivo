import {
  getGoogleApiKey,
  hasValidGoogleApiKey,
  getWeatherApiKey,
  getOsrmBaseUrl,
  DEFAULT_FALLBACK_GOOGLE_API_KEY,
  DEFAULT_FALLBACK_WEATHER_API_KEY,
  DEFAULT_OSRM_ROUTER_URL,
} from '../src/lib/config';
import Constants from 'expo-constants';

describe('Scentralizowana konfiguracja kluczy API (src/lib/config.ts - Fix 3.1)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('getGoogleApiKey zwraca klucz z process.env.EXPO_PUBLIC_GOOGLE_API_KEY gdy jest zdefiniowany', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'AIzaCustomEnvKey1234567890';
    expect(getGoogleApiKey()).toBe('AIzaCustomEnvKey1234567890');
    expect(hasValidGoogleApiKey()).toBe(true);
  });

  test('getGoogleApiKey ignoruje wartości placeholder "TYMCZASOWY" i używa awaryjnego fallbacku', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'TYMCZASOWY_KLUCZ';
    // Powinien zignorować klucz tymczasowy i użyć fallbacku
    const key = getGoogleApiKey();
    expect(key).toBe(DEFAULT_FALLBACK_GOOGLE_API_KEY);
  });

  test('getGoogleApiKey zwraca DEFAULT_FALLBACK_GOOGLE_API_KEY gdy zmienna jest pusta lub niezdefiniowana', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
    const key = getGoogleApiKey();
    expect(key).toBe(DEFAULT_FALLBACK_GOOGLE_API_KEY);
    expect(hasValidGoogleApiKey()).toBe(true);
  });

  test('hasValidGoogleApiKey rozpoznaje poprawne klucze', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'AIzaValidKey9876543210';
    expect(hasValidGoogleApiKey()).toBe(true);
  });

  test('getWeatherApiKey zwraca klucz z process.env.EXPO_PUBLIC_WEATHER_API_KEY gdy istnieje', () => {
    process.env.EXPO_PUBLIC_WEATHER_API_KEY = 'weatherCustomKey123';
    expect(getWeatherApiKey()).toBe('weatherCustomKey123');
  });

  test('getWeatherApiKey zwraca DEFAULT_FALLBACK_WEATHER_API_KEY gdy brak zmiennej w środowisku', () => {
    delete process.env.EXPO_PUBLIC_WEATHER_API_KEY;
    expect(getWeatherApiKey()).toBe(DEFAULT_FALLBACK_WEATHER_API_KEY);
  });

  test('getOsrmBaseUrl zwraca DEFAULT_OSRM_ROUTER_URL domyślnie', () => {
    delete process.env.EXPO_PUBLIC_OSRM_URL;
    expect(getOsrmBaseUrl()).toBe(DEFAULT_OSRM_ROUTER_URL);
  });

  test('getOsrmBaseUrl zwraca i oczyszcza poprawny URL z process.env.EXPO_PUBLIC_OSRM_URL', () => {
    process.env.EXPO_PUBLIC_OSRM_URL = 'https://osrm.mycompany.org/api///';
    expect(getOsrmBaseUrl()).toBe('https://osrm.mycompany.org/api');
  });

  test('getOsrmBaseUrl ignoruje nieprawidłowy URL i stosuje fallback', () => {
    process.env.EXPO_PUBLIC_OSRM_URL = 'ftp://invalid-server';
    expect(getOsrmBaseUrl()).toBe(DEFAULT_OSRM_ROUTER_URL);
  });
});
