import {
  getGoogleApiKey,
  hasValidGoogleApiKey,
  getWeatherApiKey,
  getOsrmBaseUrl,
  DEFAULT_OSRM_ROUTER_URL,
} from '../src/lib/config';

describe('Scentralizowana konfiguracja kluczy API (src/lib/config.ts - Fix 3.1)', () => {
  // Zmieniamy wartości w istniejącym obiekcie process.env (a nie podmieniamy go), bo Expo
  // odczytuje EXPO_PUBLIC_* przez referencję do oryginalnego obiektu (expo/virtual/env).
  const originalEnv = { ...process.env };

  const restoreEnv = () => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  };

  beforeEach(() => {
    jest.resetModules();
    restoreEnv();
  });

  afterAll(restoreEnv);

  test('getGoogleApiKey zwraca klucz z process.env.EXPO_PUBLIC_GOOGLE_API_KEY gdy jest zdefiniowany', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'AIzaCustomEnvKey1234567890';
    expect(getGoogleApiKey()).toBe('AIzaCustomEnvKey1234567890');
    expect(hasValidGoogleApiKey()).toBe(true);
  });

  test('getGoogleApiKey ignoruje wartości placeholder "TYMCZASOWY"', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'TYMCZASOWY_KLUCZ';
    expect(getGoogleApiKey()).not.toContain('TYMCZASOWY');
  });

  test('getGoogleApiKey zwraca pusty string gdy klucz nie jest skonfigurowany (brak klucza w kodzie)', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
    expect(getGoogleApiKey()).toBe('');
    expect(hasValidGoogleApiKey()).toBe(false);
  });

  test('hasValidGoogleApiKey rozpoznaje poprawne klucze', () => {
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = 'AIzaValidKey9876543210';
    expect(hasValidGoogleApiKey()).toBe(true);
  });

  test('getWeatherApiKey zwraca klucz z process.env.EXPO_PUBLIC_WEATHER_API_KEY gdy istnieje', () => {
    process.env.EXPO_PUBLIC_WEATHER_API_KEY = 'weatherCustomKey123';
    expect(getWeatherApiKey()).toBe('weatherCustomKey123');
  });

  test('getWeatherApiKey zwraca pusty string gdy brak zmiennej w środowisku', () => {
    delete process.env.EXPO_PUBLIC_WEATHER_API_KEY;
    expect(getWeatherApiKey()).toBe('');
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

  test('getOsrmBaseUrl używa lokalnego serwera Krakowa tylko dla punktów w obszarze testowym', () => {
    const config = {
      osrmKrakowBaseUrl: 'http://192.168.1.20:5000',
      osrmKrakowFootBaseUrl: 'http://192.168.1.20:5001',
    };
    const krakowPoints = [
      { lat: 50.0647, lon: 19.945 },
      { lat: 50.061, lon: 19.95 },
    ];
    const outsideKrakow = [{ lat: 52.2297, lon: 21.0122 }];

    expect(getOsrmBaseUrl('driving', krakowPoints, config)).toBe('http://192.168.1.20:5000');
    expect(getOsrmBaseUrl('walking', krakowPoints, config)).toBe('http://192.168.1.20:5001');
    expect(getOsrmBaseUrl('driving', outsideKrakow, config)).toBe(DEFAULT_OSRM_ROUTER_URL);
  });
});
