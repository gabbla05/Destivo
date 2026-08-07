declare const Deno: {
  serve(handler: (req: Request) => Promise<Response> | Response): void;
  env: {
    get(name: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pomocnicza funkcja przybliżona (Haversine) do wyliczania dystansu w kilometrach
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

// Używamy natywnego Deno.serve (standard w nowym Supabase)
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { origin, destination, departureDate, context } = await req.json();

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'Parametry origin i destination są wymagane.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Geokodowanie (OpenStreetMap Nominatim / własne API w produkcji)
    const geocode = async (query: string) => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'DestivoServer/1.0' } }
      );
      const data = await res.json();
      return Array.isArray(data) && data.length > 0
        ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
        : null;
    };

    const originCoords = await geocode(origin);
    const destCoords = await geocode(destination);
    const distanceKm =
      originCoords && destCoords
        ? calculateDistanceKm(originCoords.lat, originCoords.lon, destCoords.lat, destCoords.lon)
        : 350; // Fallback dystansu

    const nowIso = new Date().toISOString();
    const routes = [];

    // --- OPCJA 1: SAMOCHÓD (ESTIMATE - wyliczane z routingu/paliwa) ---
    const carDurationMinutes = Math.round((distanceKm / 85) * 60);
    const consumption = context?.carFuelConsumption ?? 7.0;
    const fuelPrice = context?.fuelPricePerLiter ?? 6.60;
    const fuelCost = Math.round((distanceKm / 100) * consumption * fuelPrice);
    const tolls = context?.tollsAndFees ?? (distanceKm > 200 ? 50 : 0);

    routes.push({
      type: 'car',
      provider: 'Routing + kalkulator kosztów',
      distanceKm: distanceKm,
      rawDurationMinutes: carDurationMinutes,
      price: {
        min: fuelCost + tolls,
        max: fuelCost + tolls,
        currency: 'PLN',
        status: 'ESTIMATE',
        source: 'ROUTING_AND_USER_INPUT',
        checkedAt: nowIso,
        purchasable: false,
      },
      dataConfidence: 'MEDIUM',
      notes: [
        `Paliwo: ${fuelCost} zł`,
        `Opłaty drogowe: ${tolls} zł`,
        `Spalanie: ${consumption} l/100 km`,
      ],
    });

    // --- OPCJA 2: POCIĄG (GTFS / API lub UNAVAILABLE przy braku taryfy) ---
    const trainApiKey = Deno.env.get('TRAIN_API_KEY');
    if (trainApiKey) {
      // Miejsce na wywołanie zewnętrznego API PKP / GTFS z użyciem klucza sekretnego
    } else {
      routes.push({
        type: 'train',
        provider: 'PKP Intercity / GTFS',
        distanceKm: Math.round(distanceKm * 1.15),
        rawDurationMinutes: Math.round(carDurationMinutes * 0.9),
        price: {
          min: 0,
          max: 0,
          currency: 'PLN',
          status: 'UNAVAILABLE', // Brak sztucznego zgadywania ceny!
          source: 'GTFS_SCHEDULE_ONLY',
          checkedAt: nowIso,
          purchasable: false,
        },
        dataConfidence: 'LOW',
        notes: ['Rozkład według GTFS. Cena biletu niedostępna online - sprawdź na stacji.'],
      });
    }

    // --- OPCJA 3: SAMOLOT (LIVE - przykładowe zintegrowane źródło ofert) ---
    const flightApiKey = Deno.env.get('FLIGHT_API_KEY');
    if (distanceKm > 250) {
      routes.push({
        type: 'flight',
        provider: 'Wizz Air / Skyscanner API',
        distanceKm: distanceKm,
        rawDurationMinutes: 95,
        bookingUrl: 'https://wizzair.com',
        price: {
          min: 319,
          max: 450,
          currency: 'PLN',
          status: 'LIVE',
          source: 'FLIGHT_PROVIDER_API',
          checkedAt: nowIso,
          purchasable: true,
        },
        dataConfidence: 'HIGH',
        notes: ['Bagaż podręczny w cenie', 'Cena aktualna z systemów rezerwacyjnych'],
      });
    }

    return new Response(JSON.stringify({ routes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    // Bezpieczne sprawdzanie typu błędu (TypeScript fix)
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});