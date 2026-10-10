/// <reference types="jest" />
import {
  normalizePlaceQuery,
  findInLocalDictionary,
  resolveCoordinates,
  calculateDistanceKm,
  determineTransportRecommendations,
} from '../src/lib/geoDatabase';
import { supabaseTransportProvider } from '../src/lib/transportProvider';
import { fetchTransportComparisons } from '../src/lib/transportCalculator';

// Mockowanie supabase API
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockRejectedValue(new Error('Network unavailable for test - force local logic')),
    },
  },
}));

describe('GeoDatabase & Transport Recommendations', () => {
  describe('1. Normalizacja zapytań i słownik lokalny', () => {
    test('powinien usunąć cyfry i rozpoznać "polski9" jako Polska / Warszawa', () => {
      const normalized = normalizePlaceQuery('polski9');
      expect(normalized).toBe('polska');

      const coords = findInLocalDictionary(normalized);
      expect(coords).toBeDefined();
      expect(coords?.lat).toBeCloseTo(52.2297, 2);
      expect(coords?.lon).toBeCloseTo(21.0122, 2);
    });

    test('powinien obsłużyć deklinację i rozpoznać "moskwy" jako Moskwa', () => {
      const normalized = normalizePlaceQuery('moskwy');
      expect(normalized).toBe('moskwa');

      const coords = findInLocalDictionary(normalized);
      expect(coords).toBeDefined();
      expect(coords?.lat).toBeCloseTo(55.7558, 2);
      expect(coords?.lon).toBeCloseTo(37.6173, 2);
    });

    test('powinien obsłużyć literówki z tolerancją Levenshteina ("warszaawa" -> Warszawa)', () => {
      const normalized = normalizePlaceQuery('warszaawa');
      const coords = findInLocalDictionary(normalized);
      expect(coords).toBeDefined();
      expect(coords?.lat).toBeCloseTo(52.2297, 2);
      expect(coords?.lon).toBeCloseTo(21.0122, 2);
    });

    test('powinien rozpoznać "rzym" bezpośrednio w słowniku', () => {
      const normalized = normalizePlaceQuery('rzym');
      const coords = findInLocalDictionary(normalized);
      expect(coords).toBeDefined();
      expect(coords?.lat).toBeCloseTo(41.9028, 2);
      expect(coords?.lon).toBeCloseTo(12.4964, 2);
    });
  });

  describe('2. Obliczanie odległości (Haversine)', () => {
    test('powinien poprawnie wyliczyć dystans Warszawa -> Rzym (> 1300 km, a NIE 500 km)', () => {
      // Warszawa (52.2297, 21.0122), Rzym (41.9028, 12.4964)
      const dist = calculateDistanceKm(52.2297, 21.0122, 41.9028, 12.4964);
      expect(dist).toBeGreaterThan(1300);
      expect(dist).toBeLessThan(1350);
      expect(dist).not.toBe(500);
    });

    test('powinien poprawnie wyliczyć dystans Warszawa -> Moskwa (> 1100 km, a NIE 500 km)', () => {
      // Warszawa (52.2297, 21.0122), Moskwa (55.7558, 37.6173)
      const dist = calculateDistanceKm(52.2297, 21.0122, 55.7558, 37.6173);
      expect(dist).toBeGreaterThan(1100);
      expect(dist).toBeLessThan(1200);
      expect(dist).not.toBe(500);
    });

    test('powinien poprawnie wyliczyć dystans Warszawa -> Berlin (~520 km)', () => {
      const dist = calculateDistanceKm(52.2297, 21.0122, 52.5200, 13.4050);
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(540);
    });

    test('powinien poprawnie wyliczyć dystans Warszawa -> Kraków (~250 km)', () => {
      const dist = calculateDistanceKm(52.2297, 21.0122, 50.0647, 19.9450);
      expect(dist).toBeGreaterThan(240);
      expect(dist).toBeLessThan(270);
    });
  });

  describe('3. Sensowny dobór środków transportu (brak pociągu dla tras > 1000 km)', () => {
    test('dla trasy dalekiej Warszawa -> Rzym (~1315 km) proponuje samolot i auto roadtrip, a NIE pociąg', () => {
      const routes = determineTransportRecommendations('Warszawa', 'Rzym', 1315);
      expect(routes.length).toBeGreaterThan(0);

      const types = routes.map((r) => r.type);
      expect(types).toContain('flight');
      expect(types).toContain('car');
      expect(types).not.toContain('train');

      const flightRoute = routes.find((r) => r.type === 'flight');
      expect(flightRoute?.provider).toContain('Skyscanner');
      expect(flightRoute?.notes[0]).toContain('~1315 km');
      expect(flightRoute?.notes[0]).not.toContain('~500 km');
    });

    test('dla trasy Polska -> Moskwa (~1151 km) proponuje samolot i auto, a NIE pociąg', () => {
      const routes = determineTransportRecommendations('Polska', 'Moskwa', 1151);
      const types = routes.map((r) => r.type);
      expect(types).toContain('flight');
      expect(types).not.toContain('train');
      expect(routes.find((r) => r.type === 'flight')?.notes[0]).toContain('~1151 km');
    });

    test('dla trasy Warszawa -> Berlin (~520 km) proponuje samolot, pociąg oraz auto', () => {
      const routes = determineTransportRecommendations('Warszawa', 'Berlin', 520);
      const types = routes.map((r) => r.type);
      expect(types).toContain('flight');
      expect(types).toContain('train');
      expect(types).toContain('car');
    });

    test('dla trasy regionalnej Warszawa -> Kraków (~252 km) proponuje pociąg i samochód', () => {
      const routes = determineTransportRecommendations('Warszawa', 'Kraków', 252);
      const types = routes.map((r) => r.type);
      expect(types).toContain('train');
      expect(types).toContain('car');
      expect(types).not.toContain('flight');
    });

    test('dla trasy lokalnej Kraków -> Katowice (~75 km) proponuje samochód', () => {
      const routes = determineTransportRecommendations('Kraków', 'Katowice', 75);
      expect(routes.length).toBe(1);
      expect(routes[0].type).toBe('car');
      expect(routes[0].notes[0]).toContain('Trasa lokalna (~75 km)');
    });
  });

  describe('4. Testy integracyjne supabaseTransportProvider', () => {
    test('zwraca realistyczne trasy dla "polski9" -> "moskwy" z odległością > 1000 km i samolotem', async () => {
      const routes = await supabaseTransportProvider.getRoutes({
        origin: 'polski9',
        destination: 'moskwy',
      });

      expect(routes.length).toBeGreaterThan(0);
      const flight = routes.find((r) => r.type === 'flight');
      expect(flight).toBeDefined();
      expect(routes.some((r) => r.type === 'train')).toBe(false);

      const note = flight?.notes?.[0] || '';
      expect(note).toMatch(/~11\d{2} km/);
      expect(note).not.toContain('~500 km');
    });

    test('zwraca realistyczne trasy dla "warszaawa" -> "rzym" z odległością ~1315 km i samolotem', async () => {
      const routes = await supabaseTransportProvider.getRoutes({
        origin: 'warszaawa',
        destination: 'rzym',
      });

      expect(routes.length).toBeGreaterThan(0);
      const flight = routes.find((r) => r.type === 'flight');
      expect(flight).toBeDefined();
      expect(routes.some((r) => r.type === 'train')).toBe(false);

      const note = flight?.notes?.[0] || '';
      expect(note).toMatch(/~13\d{2} km/);
      expect(note).not.toContain('~500 km');
    });

    test('dla nieistniejącej lokalizacji zwraca pustą listę zamiast fałszywych 500 km i pociągu', async () => {
      const routes = await supabaseTransportProvider.getRoutes({
        origin: 'asdfghjk999',
        destination: 'qwertyuiop888',
      });

      expect(routes).toEqual([]);
    });
  });

  describe('5. Dobór transportu dla małych wsi i brak stacji kolejowych', () => {
    test('dla miejscowości bez bezpośredniej stacji kolejowej rekomenduje samochód jako opcję główną', () => {
      const routes = determineTransportRecommendations('Warszawa', 'Ciecholewy', 263, {
        hasStation: false,
        stationName: 'Swarożyn',
        stationDistanceKm: 5.4,
      });

      expect(routes.length).toBeGreaterThan(0);
      const carRoute = routes.find((r) => r.type === 'car');
      expect(carRoute).toBeDefined();
      expect(carRoute?.notes[0]).toContain('Miejscowość bez bezpośredniej stacji kolejowej');
      expect(carRoute?.notes[0]).toContain('~263 km');
      expect(carRoute?.notes[0]).not.toContain('~500 km');

      // Jeśli dodano pociąg przesiadkowy, nie może twierdzić, że stacja jest w Ciecholewach
      const trainRoute = routes.find((r) => r.type === 'train');
      if (trainRoute) {
        expect(trainRoute.notes[0]).toContain('Swarożyn');
        expect(trainRoute.actionLinks.some((l) => l.label.includes('Swarożyn'))).toBe(true);
      }
    });

    test('dla odległej wsi bez żadnej stacji w pobliżu (> 20 km) NIE proponuje pociągu wcale', () => {
      const routes = determineTransportRecommendations('Warszawa', 'Bieszczady Odcięte', 380, {
        hasStation: false,
      });

      expect(routes.length).toBe(1);
      expect(routes[0].type).toBe('car');
      expect(routes.some((r) => r.type === 'train')).toBe(false);
    });

    test('supabaseTransportProvider odrzuca fałszywe ~500 km zwrócone przez zdalną funkcję i wylicza rzeczywistą odległość', async () => {
      const { supabase } = require('../src/lib/supabase');
      // Symulujemy zdalną funkcję Edge Function zwracającą stare fałszywe 500 km dla trasy 252 km
      supabase.functions.invoke.mockResolvedValueOnce({
        data: {
          routes: [
            {
              type: 'train',
              provider: 'PKP Intercity / Koleo',
              notes: ['Rekomendowane połączenie kolejowe (~500 km). Sprawdź bilety na Koleo.'],
              actionLinks: [],
            },
          ],
        },
        error: null,
      });

      const routes = await supabaseTransportProvider.getRoutes({
        origin: 'Warszawa',
        destination: 'Kraków',
      });

      // Powinno odrzucić fałszywe 500 km i wygenerować trasę z rzeczywistym dystansem ~252 km
      expect(routes.length).toBeGreaterThan(0);
      const note = routes[0].notes[0];
      expect(note).toMatch(/~25\d km/);
      expect(note).not.toContain('~500 km');
    });
  });
});
