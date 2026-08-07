import { supabase } from './supabase';
import {
  TransportDataProvider,
  UserTravelContext,
  buildCarRouteFromRoutingData,
} from './transportCalculator';

export interface TransportSearchRequest {
  origin: string;
  destination: string;
  departureDate?: string;
  passengers?: number;
  context?: UserTravelContext;
}

// Pomocniczy kalkulator dystansu (Haversine) na wypadek awarii chmury
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const supabaseTransportProvider: TransportDataProvider = {
  async getRoutes({ origin, destination, departureAt, context }) {
    try {
      // 1. Próba wywołania Supabase Edge Function 'transport-search'
      const { data, error } = await supabase.functions.invoke('transport-search', {
        body: {
          origin,
          destination,
          departureDate: departureAt,
          passengers: 1,
          context,
        } as TransportSearchRequest,
      });

      if (error) {
        throw error;
      }

      if (data && Array.isArray(data.routes)) {
        return data.routes;
      }

      return [];
    } catch (err) {
      console.warn('Awaria Edge Function, liczymy realny dystans awaryjnie w aplikacji...', err);

      try {
        // 2. Realny Fallback: Geokodowanie bezpośrednio z aplikacji (OpenStreetMap)
        const geocode = async (query: string) => {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              query
            )}&limit=1`,
            {
              headers: {
                'User-Agent': 'DestivoAppFallback/1.0',
              },
            }
          );
          const data = await res.json();
          return Array.isArray(data) && data.length > 0
            ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
            : null;
        };

        const [originCoords, destCoords] = await Promise.all([
          geocode(origin),
          geocode(destination),
        ]);

        // Dystans w linii prostej * 1.25 (przelicznik na krętość dróg)
        const airDistance =
          originCoords && destCoords
            ? calculateDistanceKm(
                originCoords.lat,
                originCoords.lon,
                destCoords.lat,
                destCoords.lon
              )
            : 0;

        const roadDistance = airDistance > 0 ? Math.round(airDistance * 1.25) : 300;
        // Średnia prędkość przelotowa w trasie ~85 km/h
        const durationMinutes = Math.round((roadDistance / 85) * 60);

        return [
          buildCarRouteFromRoutingData({
            distanceKm: roadDistance,
            durationMinutes: durationMinutes,
            provider: 'Kalkulator offline (Szacunek GPS)',
            context,
          }),
        ];
      } catch (fallbackErr) {
        console.error('Błąd całkowity fallbacku:', fallbackErr);
        return [];
      }
    }
  },
};