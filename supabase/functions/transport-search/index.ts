/// <reference path="./deno-shims.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

async function getCoords(cityName: string) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&limit=1`, {
      headers: { 'User-Agent': 'DestivoApp/1.0' }
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn("Geocoding error:", e);
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { origin, destination } = await req.json()

    if (!origin || !destination) {
      return new Response(JSON.stringify({ routes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pobieramy współrzędne tylko po to, żeby znać odległość (km)
    const [origCoords, destCoords] = await Promise.all([
      getCoords(origin),
      getCoords(destination)
    ]);

    const airDistance = (origCoords && destCoords) 
      ? calculateDistanceKm(origCoords.lat, origCoords.lon, destCoords.lat, destCoords.lon)
      : 500; // domyślny fallback jakby geokodowanie przymuliło

    let transportPlan: any[] = [];

    // KRYTERIA LOGISTYCZNE SPÓJNE Z EXPLORE:
    // < 120 km: Auto
    // 120 - 550 km: Pociąg + Auto
    // > 550 km: Samolot + Auto
    if (airDistance < 120) {
      // 1. TRASY KRÓTKIE / LOKALNE (< 120 km) -> Samochód
      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Trasa lokalna (~${airDistance} km). Najwygodniej udać się bezpośrednio własnym samochodem.`]
      });
    } else if (airDistance >= 120 && airDistance <= 550) {
      // 2. TRASY ŚREDNIE / REGIONALNE (120 - 550 km) -> Pociąg + Samochód
      transportPlan.push({
        type: 'train',
        provider: 'PKP Intercity / Koleo',
        bookingUrl: 'https://koleo.pl',
        actionLinks: [
          { label: `Pokaż stację w: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}` },
          { label: `Pokaż stację w: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(destination)}` }
        ],
        notes: [`Rekomendowane połączenie kolejowe (~${airDistance} km). Sprawdź bilety na Koleo.`]
      });

      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Podróż własnym samochodem z punktu A do B (~${airDistance} km).`]
      });
    } else {
      // 3. TRASY MIĘDZYNARODOWE / DALEKIE (> 550 km) -> Samolot + Samochód
      transportPlan.push({
        type: 'flight',
        provider: 'Połączenie lotnicze (Skyscanner)',
        bookingUrl: 'https://www.skyscanner.pl',
        actionLinks: [
          { label: `Lotnisko w okolicach: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(origin)}` },
          { label: `Lotnisko w okolicach: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(destination)}` }
        ],
        notes: [`Trasa daleka/międzynarodowa (~${airDistance} km). Sprawdź loty na Skyscanner.`]
      });

      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód (Roadtrip)',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Dla fanów długich tras samochodowych (~${airDistance} km).`]
      });
    }

    return new Response(JSON.stringify({ routes: transportPlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})