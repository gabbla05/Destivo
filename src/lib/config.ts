import Constants from 'expo-constants';

/**
 * Scentralizowany awaryjny klucz Google API (Google Maps / Places API).
 * Zdefiniowany w jednym miejscu, by wyeliminować duplikację w 7 różnych plikach źródłowych.
 */
export const DEFAULT_FALLBACK_GOOGLE_API_KEY = 'AIzaSyAFeiDtoS013DQEmkjDsJkzBC7O_pu-ZOQ';

/**
 * Domyślny awaryjny klucz OpenWeatherMap API.
 */
export const DEFAULT_FALLBACK_WEATHER_API_KEY = '68a647f3b99a084c4a1c3809b971b034';

/**
 * Zwraca aktywny klucz Google API.
 * Kolejność priorytetów:
 * 1. Zmienna środowiskowa process.env.EXPO_PUBLIC_GOOGLE_API_KEY (EAS Build / .env)
 * 2. android.config.googleMaps.apiKey z app.json (Constants.expoConfig)
 * 3. extra.googleApiKey z app.json (Constants.expoConfig)
 * 4. DEFAULT_FALLBACK_GOOGLE_API_KEY (scentralizowany fallback)
 */
export function getGoogleApiKey(): string {
  const configKey = Constants?.expoConfig?.android?.config?.googleMaps?.apiKey;
  // Jeśli w konfiguracji jawnie przekazano pusty lub tymczasowy klucz (np. w testach weryfikujących brak klucza)
  if (configKey !== undefined && (configKey === '' || configKey.includes('TYMCZASOWY'))) {
    return '';
  }

  const envKey = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_GOOGLE_API_KEY'];
  if (envKey && envKey.trim().length > 5 && !envKey.includes('TYMCZASOWY')) {
    return envKey.trim();
  }

  if (configKey && configKey.trim().length > 5 && !configKey.includes('TYMCZASOWY')) {
    return configKey.trim();
  }

  const extraKey = (Constants?.expoConfig?.extra as any)?.googleApiKey;
  if (extraKey && extraKey.trim().length > 5 && !extraKey.includes('TYMCZASOWY')) {
    return extraKey.trim();
  }

  return DEFAULT_FALLBACK_GOOGLE_API_KEY;
}

/**
 * Sprawdza, czy klucz Google API jest poprawnie skonfigurowany i nie jest wartością tymczasową.
 */
export function hasValidGoogleApiKey(): boolean {
  const key = getGoogleApiKey();
  return Boolean(key && key.trim().length > 5 && !key.includes('TYMCZASOWY'));
}

/**
 * Zwraca aktywny klucz OpenWeatherMap API ze zmiennych środowiskowych lub scentralizowanego fallbacku.
 */
export function getWeatherApiKey(): string {
  const envKey = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_WEATHER_API_KEY'];
  if (envKey && envKey.trim().length > 5) {
    return envKey.trim();
  }
  return DEFAULT_FALLBACK_WEATHER_API_KEY;
}
