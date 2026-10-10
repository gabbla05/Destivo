import { supabase } from './supabase';
import {
  TransportDataProvider,
  UserTravelContext,
} from './transportCalculator';
import {
  resolveCoordinates,
  calculateDistanceKm,
  determineTransportRecommendations,
  checkDestinationStation,
  StationInfo,
} from './geoDatabase';

export interface TransportSearchRequest {
  origin: string;
  destination: string;
  originCoords?: { lat: number; lon: number };
  destinationCoords?: { lat: number; lon: number };
  departureDate?: string;
  passengers?: number;
  context?: UserTravelContext;
}

export const supabaseTransportProvider: TransportDataProvider = {
  async getRoutes({ origin, destination, departureAt, context }) {
    if (!origin?.trim() || !destination?.trim()) {
      return [];
    }

    // 1. Rozwiązujemy współrzędne na poziomie aplikacji (offline słownik miast + geokoder Nominatim)
    const [origCoords, destCoords] = await Promise.all([
      resolveCoordinates(origin),
      resolveCoordinates(destination),
    ]);

    const realDistance =
      origCoords && destCoords
        ? calculateDistanceKm(origCoords.lat, origCoords.lon, destCoords.lat, destCoords.lon)
        : 0;

    // 2. Weryfikujemy obecność stacji kolejowej w miejscu docelowym (czy wieś, czy miasto ze stacją)
    let stationInfo: StationInfo = { hasStation: true };
    if (destCoords) {
      try {
        stationInfo = await checkDestinationStation(destination, destCoords);
      } catch {
        stationInfo = { hasStation: false };
      }
    }

    // 3. Próba wywołania Supabase Edge Function 'transport-search' z przekazaniem współrzędnych
    try {
      const { data, error } = await supabase.functions.invoke('transport-search', {
        body: {
          origin: origin.trim(),
          destination: destination.trim(),
          originCoords: origCoords ? { lat: origCoords.lat, lon: origCoords.lon } : undefined,
          destinationCoords: destCoords ? { lat: destCoords.lat, lon: destCoords.lon } : undefined,
          departureDate: departureAt,
          passengers: 1,
          context,
        } as TransportSearchRequest,
      });

      if (!error && data && Array.isArray(data.routes) && data.routes.length > 0) {
        // Zabezpieczenie przed błędem starej wersji Edge Function:
        // A) Jeśli funkcja zwraca sztywne ~500 km, a rzeczywisty dystans różni się lub jest nieznany
        const isStale500km =
          data.routes.some((r: any) =>
            r.notes?.some((n: string) => /~500\s*km/i.test(n))
          ) && (realDistance === 0 || Math.abs(realDistance - 500) > 40);

        // B) Jeśli miejscowość to wieś bez stacji, a funkcja proponuje bezpośredni pociąg do tej wsi
        const isInvalidVillageTrain =
          !stationInfo.hasStation &&
          data.routes.some(
            (r: any) =>
              r.type === 'train' &&
              !r.notes?.some((n: string) => /przesiadk|lokaln/i.test(n))
          );

        if (!isStale500km && !isInvalidVillageTrain && realDistance > 0) {
          // Upewniamy się, że notatki i dystans odzwierciedlają rzeczywistą odległość
          return data.routes.map((r: any) => ({
            ...r,
            notes:
              r.notes?.map((n: string) =>
                n.replace(/~[0-9]+\s*km/i, `~${realDistance} km`)
              ) || [],
          }));
        }
      }
    } catch (err) {
      console.warn('Edge Function niedostępna lub zwróciła błąd, wyznaczamy trasy lokalnie...', err);
    }

    // 4. Niezawodny fallback klienta: generowanie tras na podstawie rzeczywistych współrzędnych i stacji
    if (realDistance > 0) {
      return determineTransportRecommendations(
        origin.trim(),
        destination.trim(),
        realDistance,
        stationInfo
      );
    }

    // 5. Jeśli lokalizacji nie udało się ustalić (np. losowy ciąg znaków), nie generujemy fałszywych tras
    return [];
  },
};