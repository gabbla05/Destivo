/// <reference types="jest" />
import {
  determineTransport,
  calculateDistanceKm,
  findNearestAirport,
  fetchCityWeather,
  fetchCityGooglePhoto,
  getFallbackRecommendations,
  generateLiveRecommendations,
  CITIES_WITH_PREDEFINED_PLANS,
  DESTINATION_POOL,
  POLISH_AIRPORTS,
} from '../src/lib/liveExplore';

// Mock fetch globalny
const originalFetch = global.fetch;

describe('LiveExplore - Rygorystyczne testy algorytmu i Etapów 1, 2, 3', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('1. determineTransport - Progi odległościowe', () => {
    test('zwraca "car" dla dystansów poniżej 120 km', () => {
      expect(determineTransport(0)).toBe('car');
      expect(determineTransport(50)).toBe('car');
      expect(determineTransport(119)).toBe('car');
    });

    test('zwraca "train" dla dystansów od 120 km do 550 km włącznie', () => {
      expect(determineTransport(120)).toBe('train');
      expect(determineTransport(300)).toBe('train');
      expect(determineTransport(550)).toBe('train');
    });

    test('zwraca "flight" dla dystansów powyżej 550 km', () => {
      expect(determineTransport(551)).toBe('flight');
      expect(determineTransport(1200)).toBe('flight');
      expect(determineTransport(3000)).toBe('flight');
    });
  });

  describe('2. calculateDistanceKm - Obliczanie odległości geodezyjnej', () => {
    test('zwraca 0 km dla tych samych koordynatów', () => {
      const dist = calculateDistanceKm(52.2297, 21.0122, 52.2297, 21.0122);
      expect(dist).toBe(0);
    });

    test('oblicza poprawną odległość między Warszawą a Krakowem (~250-300 km)', () => {
      const dist = calculateDistanceKm(52.2297, 21.0122, 50.0647, 19.9450);
      expect(dist).toBeGreaterThan(240);
      expect(dist).toBeLessThan(300);
    });
  });

  describe('3. Etap 1: findNearestAirport - Wyznaczanie najbliższego polskiego lotniska wylotowego', () => {
    test('dla lokalizacji w Warszawie zwraca lotnisko Chopina (WAW)', () => {
      const airport = findNearestAirport(52.2297, 21.0122);
      expect(airport.code).toBe('WAW');
      expect(airport.city).toBe('Warszawa');
    });

    test('dla lokalizacji w Krakowie zwraca Balice (KRK)', () => {
      const airport = findNearestAirport(50.0647, 19.9450);
      expect(airport.code).toBe('KRK');
      expect(airport.city).toBe('Kraków');
    });

    test('dla lokalizacji w Trójmieście zwraca Rębiechowo (GDN)', () => {
      const airport = findNearestAirport(54.3520, 18.6466);
      expect(airport.code).toBe('GDN');
      expect(airport.city).toBe('Gdańsk');
    });

    test('dla lokalizacji we Wrocławiu zwraca Strachowice (WRO)', () => {
      const airport = findNearestAirport(51.1079, 17.0385);
      expect(airport.code).toBe('WRO');
      expect(airport.city).toBe('Wrocław');
    });

    test('dla lokalizacji na Śląsku zwraca Pyrzowice (KTW)', () => {
      const airport = findNearestAirport(50.2649, 19.0238);
      expect(airport.code).toBe('KTW');
      expect(airport.city).toBe('Katowice');
    });

    test('dla lokalizacji w Poznaniu zwraca Ławicę (POZ)', () => {
      const airport = findNearestAirport(52.4064, 16.9252);
      expect(airport.code).toBe('POZ');
      expect(airport.city).toBe('Poznań');
    });
  });

  describe('4. Etap 2: fetchCityWeather - Weryfikacja pogody i wykluczenie anomalii atmosferycznych', () => {
    const romeDest = DESTINATION_POOL.find((d) => d.city === 'Rzym')!;
    const bariDest = DESTINATION_POOL.find((d) => d.city === 'Bari')!;

    const createWeatherResponse = (listItems: any[]) => ({
      ok: true,
      text: async () => JSON.stringify({ list: listItems }),
      json: async () => ({ list: listItems }),
    });

    test('wyklucza destynację, jeśli odległość od użytkownika < 20 km (użytkownik już tam jest)', async () => {
      // Użytkownik znajduje się dokładnie w Rzymie
      const res = await fetchCityWeather(romeDest, romeDest.lat, romeDest.lon, 'WAW');
      expect(res).toBeNull();
    });

    test('[Sukces] dopuszcza destynację przy słonecznej, stabilnej pogodzie (kod 800, 22°C)', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: 22 }, weather: [{ id: 800, description: 'Bezchmurnie', icon: '01d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: 23 }, weather: [{ id: 800, description: 'Bezchmurnie', icon: '01d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: 21 }, weather: [{ id: 800, description: 'Bezchmurnie', icon: '01d' }] },
          { dt_txt: '2026-09-23 12:00:00', main: { temp: 22 }, weather: [{ id: 800, description: 'Bezchmurnie', icon: '01d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).not.toBeNull();
      expect(res?.city).toBe('Rzym');
      expect(res?.hasPredefinedPlan).toBe(true);
      expect(res?.proposedTrip?.estimatedTemp).toBeGreaterThan(15);
      expect(res?.proposedTrip?.condition).toContain('Bez opadów');
    });

    test('[Anomalia: Burza] wyklucza destynację, gdy prognoza zawiera burzę z piorunami (kod 211)', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: 20 }, weather: [{ id: 211, description: 'Burza z piorunami', icon: '11d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: 21 }, weather: [{ id: 211, description: 'Burza z piorunami', icon: '11d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: 20 }, weather: [{ id: 211, description: 'Burza z piorunami', icon: '11d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('[Anomalia: Ulewa / Oberwanie chmury] wyklucza destynację przy ulewach (kod 502)', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: 16 }, weather: [{ id: 502, description: 'Gwałtowna ulewa', icon: '10d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: 15 }, weather: [{ id: 502, description: 'Gwałtowna ulewa', icon: '10d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: 16 }, weather: [{ id: 502, description: 'Gwałtowna ulewa', icon: '10d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('[Anomalia: Zamieć śnieżna] wyklucza destynację przy gwałtownych opadach śniegu (kod 602)', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: -2 }, weather: [{ id: 602, description: 'Ciężki śnieg', icon: '13d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: -3 }, weather: [{ id: 602, description: 'Ciężki śnieg', icon: '13d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: -2 }, weather: [{ id: 602, description: 'Ciężki śnieg', icon: '13d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('[Anomalia: Tornado] wyklucza destynację przy zjawiskach ekstremalnych (kod 781)', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: 18 }, weather: [{ id: 781, description: 'Tornado', icon: '50d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: 18 }, weather: [{ id: 781, description: 'Tornado', icon: '50d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: 18 }, weather: [{ id: 781, description: 'Tornado', icon: '50d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('[Anomalia temperaturowa: Skrajny upał] wyklucza destynację powyżej 40°C', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: 43 }, weather: [{ id: 800, description: 'Upał', icon: '01d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: 42 }, weather: [{ id: 800, description: 'Upał', icon: '01d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: 41 }, weather: [{ id: 800, description: 'Upał', icon: '01d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('[Anomalia temperaturowa: Skrajny mróz] wyklucza destynację poniżej -10°C', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        createWeatherResponse([
          { dt_txt: '2026-09-20 12:00:00', main: { temp: -18 }, weather: [{ id: 800, description: 'Mróz', icon: '01d' }] },
          { dt_txt: '2026-09-21 12:00:00', main: { temp: -19 }, weather: [{ id: 800, description: 'Mróz', icon: '01d' }] },
          { dt_txt: '2026-09-22 12:00:00', main: { temp: -17 }, weather: [{ id: 800, description: 'Mróz', icon: '01d' }] },
        ])
      ) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });

    test('zwraca null w przypadku błędu sieci lub statusu != 200 z Weather API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res).toBeNull();
    });
  });

  describe('5. Etap 3: Dopasowywanie gotowych szablonów wycieczek', () => {
    test('miasta ze zbioru CITIES_WITH_PREDEFINED_PLANS otrzymują hasPredefinedPlan: true i harmonogram', async () => {
      const romeDest = DESTINATION_POOL.find((d) => d.city === 'Rzym')!;

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            list: [
              { dt_txt: '2026-09-20 12:00:00', main: { temp: 22 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-21 12:00:00', main: { temp: 23 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-22 12:00:00', main: { temp: 21 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-23 12:00:00', main: { temp: 22 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
            ],
          }),
      }) as any;

      const res = await fetchCityWeather(romeDest, 52.2297, 21.0122, 'WAW');
      expect(res?.hasPredefinedPlan).toBe(true);
      expect(res?.proposedTrip?.itinerary.length).toBeGreaterThanOrEqual(2);
      expect(res?.proposedTrip?.itinerary[0].attractions.length).toBeGreaterThan(0);
    });

    test('miasta spoza zbioru (np. Bari) otrzymują hasPredefinedPlan: false i pusty harmonogram', async () => {
      const bariDest = DESTINATION_POOL.find((d) => d.city === 'Bari')!;
      expect(CITIES_WITH_PREDEFINED_PLANS.has('Bari')).toBe(false);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            list: [
              { dt_txt: '2026-09-20 12:00:00', main: { temp: 24 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-21 12:00:00', main: { temp: 25 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-22 12:00:00', main: { temp: 24 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
              { dt_txt: '2026-09-23 12:00:00', main: { temp: 25 }, weather: [{ id: 800, description: 'Słonecznie', icon: '01d' }] },
            ],
          }),
      }) as any;

      const res = await fetchCityWeather(bariDest, 52.2297, 21.0122, 'WAW');
      expect(res?.hasPredefinedPlan).toBe(false);
      expect(res?.proposedTrip?.itinerary.length).toBe(0); // Pusty plan - do samodzielnego ułożenia
    });
  });

  describe('6. Google Places Photo Fetching & Fallback - Eliminacja brzydkiego mocka', () => {
    test('fetchCityGooglePhoto zwraca sformatowany URL, gdy API zwraca zdjęcie', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          status: 'OK',
          results: [
            {
              name: 'Koloseum',
              user_ratings_total: 150000,
              photos: [{ photo_reference: 'PHOTO_REF_12345' }],
            },
          ],
        }),
      }) as any;

      const photoUrl = await fetchCityGooglePhoto('Rzym', 41.9028, 12.4964);
      expect(photoUrl).toContain('maps.googleapis.com');
      expect(photoUrl).toContain('PHOTO_REF_12345');
    });

    test('fetchCityGooglePhoto zwraca null przy braku zdjęć lub błędzie API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      }) as any;

      const photoUrl = await fetchCityGooglePhoto('Nieznane', 0, 0);
      expect(photoUrl).toBeNull();
    });

    test('getFallbackRecommendations nie zawiera starego pustynnego mocka (photo-1488646953014-85cb44e25828)', () => {
      const fallbacks = getFallbackRecommendations(52.2297, 21.0122);
      expect(fallbacks.length).toBeGreaterThan(0);

      fallbacks.forEach((dest) => {
        expect(dest.coverImage).not.toContain('photo-1488646953014-85cb44e25828');
        expect(dest.coverImage.length).toBeGreaterThan(15);
      });
    });

    test('każda destynacja w DESTINATION_POOL posiada unikalne, niepuste zdjęcie', () => {
      const coverImages = new Set<string>();
      DESTINATION_POOL.forEach((dest) => {
        expect(dest.coverImage).toBeTruthy();
        expect(dest.coverImage).not.toContain('photo-1488646953014-85cb44e25828');
        coverImages.add(dest.coverImage);
      });
      // Sprawdzamy czy większość miast ma dedykowane, unikalne zdjęcia
      expect(coverImages.size).toBe(DESTINATION_POOL.length);
    });
  });

  describe('7. generateLiveRecommendations - Integracja całego modułu LiveExplore', () => {
    test('zwraca listę rekomendacji nawet w przypadku awarii sieci (bezpieczny fallback)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network Offline')) as any;

      const recommendations = await generateLiveRecommendations();
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);

      recommendations.forEach((dest) => {
        expect(['flight', 'train', 'car']).toContain(dest.recommendedTransport);
        expect(dest.proposedTrip).toBeDefined();
        expect(dest.coverImage).not.toContain('photo-1488646953014-85cb44e25828');
      });
    });
  });
});
