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
 * Domyślny adres bazowy serwera OSRM dla profilu samochodowego (Open Source Routing Machine).
 */
export const DEFAULT_OSRM_ROUTER_URL = 'https://router.project-osrm.org';

/**
 * Domyślny adres bazowy serwera routingu pieszego OpenStreetMap (Foot routing).
 */
export const DEFAULT_OSRM_FOOT_ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot';

/**
 * Zwraca aktywny klucz Google API.
 * Kolejność priorytetów:
 * 1. Zmienna środowiskowa process.env.EXPO_PUBLIC_GOOGLE_API_KEY (EAS Build / .env)
 * 2. android.config.googleMaps.apiKey z app.json (Constants.expoConfig)
 * 3. extra.googleApiKey z app.json (Constants.expoConfig)
 * 4. DEFAULT_FALLBACK_GOOGLE_API_KEY (scentralizowany fallback)
 */
export function getGoogleApiKey(): string {
  // 1. Zmienna środowiskowa process.env.EXPO_PUBLIC_GOOGLE_API_KEY (najwyższy priorytet)
  const envKey = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_GOOGLE_API_KEY'];
  if (envKey && envKey.trim().length > 5 && !envKey.includes('TYMCZASOWY')) {
    return envKey.trim();
  }

  // 2. android.config.googleMaps.apiKey z app.json (Constants.expoConfig)
  const configKey = Constants?.expoConfig?.android?.config?.googleMaps?.apiKey;
  if (configKey && configKey.trim().length > 5 && !configKey.includes('TYMCZASOWY')) {
    return configKey.trim();
  }

  // 3. extra.googleApiKey z app.json (Constants.expoConfig)
  const extraKey = (Constants?.expoConfig?.extra as any)?.googleApiKey;
  if (extraKey && extraKey.trim().length > 5 && !extraKey.includes('TYMCZASOWY')) {
    return extraKey.trim();
  }

  // 4. Jeśli w konfiguracji jawnie oznaczono klucz jako tymczasowy lub pusty
  if (configKey !== undefined && (configKey === '' || configKey.includes('TYMCZASOWY'))) {
    return '';
  }

  // 5. Awaryjny fallback scentralizowany
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

/**
 * Zwraca aktywny adres bazowy serwera routingu OSRM dla zadanego profilu.
 * Obsługuje dedykowane serwery dla profilu samochodowego ('driving') i pieszego ('walking').
 */
export function getOsrmBaseUrl(
  profile: 'driving' | 'walking' = 'driving',
  points?: Array<{ lat: number; lon: number }>,
  extraConfig: Record<string, unknown> = (Constants?.expoConfig?.extra || {}) as Record<string, unknown>
): string {
  const sanitizeAndValidate = (urlStr: string): string | null => {
    try {
      const trimmed = urlStr.trim().replace(/\/+$/, '');
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimmed;
      }
    } catch {
      // Ignorujemy niepoprawny format URL
    }
    return null;
  };

  const isKrakowTestArea =
    Array.isArray(points) &&
    points.length > 0 &&
    points.every(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lon) &&
        point.lat >= 49.85 &&
        point.lat <= 50.25 &&
        point.lon >= 19.65 &&
        point.lon <= 20.25
    );
  if (isKrakowTestArea) {
    const krakowEnvUrl =
      profile === 'walking'
        ? extraConfig.osrmKrakowFootBaseUrl
        : extraConfig.osrmKrakowBaseUrl;
    if (typeof krakowEnvUrl === 'string' && krakowEnvUrl.trim().length > 0) {
      const valid = sanitizeAndValidate(krakowEnvUrl);
      if (valid) return valid;
    }
  }

  if (profile === 'walking') {
    const footEnvUrl =
      (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_OSRM_FOOT_BASE_URL'] ||
      (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_OSRM_WALKING_BASE_URL'] ||
      (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_OSRM_FOOT_URL'];
    if (footEnvUrl && footEnvUrl.trim().length > 0) {
      const valid = sanitizeAndValidate(footEnvUrl);
      if (valid) return valid;
    }

    const extraFootUrl =
      (Constants?.expoConfig?.extra as any)?.osrmFootBaseUrl ||
      (Constants?.expoConfig?.extra as any)?.osrmWalkingBaseUrl;
    if (extraFootUrl && typeof extraFootUrl === 'string' && extraFootUrl.trim().length > 0) {
      const valid = sanitizeAndValidate(extraFootUrl);
      if (valid) return valid;
    }

    return DEFAULT_OSRM_FOOT_ROUTER_URL;
  }

  const envUrl =
    (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_OSRM_BASE_URL'] ||
    (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_OSRM_URL'];
  if (envUrl && envUrl.trim().length > 0) {
    const valid = sanitizeAndValidate(envUrl);
    if (valid) return valid;
  }

  const extraUrl =
    (Constants?.expoConfig?.extra as any)?.osrmBaseUrl ||
    (Constants?.expoConfig?.extra as any)?.osrmUrl;
  if (extraUrl && typeof extraUrl === 'string' && extraUrl.trim().length > 0) {
    const valid = sanitizeAndValidate(extraUrl);
    if (valid) return valid;
  }

  return DEFAULT_OSRM_ROUTER_URL;
}
