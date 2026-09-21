// __tests__/tests_RouteOptimization.test.ts
import {
  haversineDistance,
  buildDistanceMatrix,
  calculatePathDistance,
  solveGreedyTSP,
  solveTwoOptTSP,
  solveSimulatedAnnealingTSP,
  solveBruteForceTSP,
  optimizeSightseeingRoute,
  recalculateItineraryTimes,
  calculateTransitEstimates,
  buildGoogleMapsDirectionsUrl,
  resolvePointCoordinates,
  type GeoPoint,
} from '../src/lib/routeOptimization';

describe('Optymalizacja Trasy Zwiedzania (Problem Komiwojażera / TSP)', () => {
  // Przykładowe współrzędne znanych atrakcji Rzymu
  const colosseum: GeoPoint = { id: 'colosseum', title: 'Koloseum', lat: 41.8902, lon: 12.4922 };
  const pantheon: GeoPoint = { id: 'pantheon', title: 'Panteon', lat: 41.8986, lon: 12.4769 };
  const trevi: GeoPoint = { id: 'trevi', title: 'Fontanna di Trevi', lat: 41.9009, lon: 12.4833 };
  const spanishSteps: GeoPoint = { id: 'spanish', title: 'Schody Hiszpańskie', lat: 41.9060, lon: 12.4828 };
  const vatican: GeoPoint = { id: 'vatican', title: 'Watykan', lat: 41.9022, lon: 12.4539 };

  describe('1. Formuła Haversine i Macierz Odległości', () => {
    test('Powinien poprawnie obliczyć odległość między punktami (np. Koloseum i Watykan)', () => {
      const dist = haversineDistance(colosseum.lat, colosseum.lon, vatican.lat, vatican.lon);
      // Rzeczywista odległość w linii prostej to ~3.43 km
      expect(dist).toBeGreaterThan(3.0);
      expect(dist).toBeLessThan(4.0);
    });

    test('Odległość punktu do samego siebie powinna wynosić 0', () => {
      const dist = haversineDistance(pantheon.lat, pantheon.lon, pantheon.lat, pantheon.lon);
      expect(dist).toBe(0);
    });

    test('buildDistanceMatrix powinien zwrócić symetryczną macierz z zerami na przekątnej', () => {
      const points = [colosseum, pantheon, trevi];
      const matrix = buildDistanceMatrix(points);

      expect(matrix.length).toBe(3);
      expect(matrix[0][0]).toBe(0);
      expect(matrix[1][1]).toBe(0);
      expect(matrix[2][2]).toBe(0);

      // Symetryczność D[i][j] === D[j][i]
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 5);
      expect(matrix[0][2]).toBeCloseTo(matrix[2][0], 5);
      expect(matrix[1][2]).toBeCloseTo(matrix[2][1], 5);
    });

    test('calculatePathDistance powinien zwrócić 0 dla pustej ścieżki lub 1 punktu', () => {
      const matrix = buildDistanceMatrix([colosseum]);
      expect(calculatePathDistance([], matrix)).toBe(0);
      expect(calculatePathDistance([0], matrix)).toBe(0);
    });
  });

  describe('2. Algorytmy TSP (Greedy, 2-Opt, Simulated Annealing, Brute Force)', () => {
    // Celowo ułożona trasa w "zygzak" (criss-cross):
    // Watykan -> Koloseum -> Schody Hiszpańskie -> Panteon -> Trevi
    const zigzagPoints = [vatican, colosseum, spanishSteps, pantheon, trevi];
    const matrix = buildDistanceMatrix(zigzagPoints);

    test('Algorytm Zachłanny (Nearest Neighbor) powinien wyznaczyć kompletną permutację', () => {
      const res = solveGreedyTSP(matrix, 0);
      expect(res.route.length).toBe(5);
      expect(new Set(res.route).size).toBe(5);
      expect(res.route[0]).toBe(0); // Start z punktu 0
      expect(res.distance).toBeGreaterThan(0);
    });

    test('Algorytm 2-Opt powinien zredukować lub utrzymać dystans względem trasy startowej', () => {
      const initialRoute = [0, 1, 2, 3, 4];
      const initialDist = calculatePathDistance(initialRoute, matrix);
      const res = solveTwoOptTSP(initialRoute, matrix, true);

      expect(res.route.length).toBe(5);
      expect(new Set(res.route).size).toBe(5);
      expect(res.distance).toBeLessThanOrEqual(initialDist);
    });

    test('Symulowane Wyżarzanie (Simulated Annealing) powinno zwrócić poprawną trasę', () => {
      const initialRoute = [0, 1, 2, 3, 4];
      const res = solveSimulatedAnnealingTSP(initialRoute, matrix, true);

      expect(res.route.length).toBe(5);
      expect(new Set(res.route).size).toBe(5);
      expect(res.iterations).toBeGreaterThan(0);
    });

    test('Metoda Dokładna (Brute Force) powinna znaleźć globalne optimum dla N <= 8', () => {
      const res = solveBruteForceTSP(matrix, true);
      expect(res).not.toBeNull();
      if (res) {
        expect(res.route.length).toBe(5);
        expect(res.route[0]).toBe(0);
        // Żaden algorytm heurystyczny nie może mieć mniejszego dystansu niż Brute Force
        const greedyRes = solveGreedyTSP(matrix, 0);
        expect(res.distance).toBeLessThanOrEqual(greedyRes.distance + 1e-6);
      }
    });

    test('Metoda Dokładna powinna zwrócić null dla N > 8 (zabezpieczenie wydajnościowe)', () => {
      const largeMatrix = Array.from({ length: 9 }, () => new Array(9).fill(1));
      const res = solveBruteForceTSP(largeMatrix, true);
      expect(res).toBeNull();
    });
  });

  describe('3. Pełny proces optymalizacji (optimizeSightseeingRoute)', () => {
    test('Powinien wygenerować statystyki oszczędności dystansu i tabelę benchmarków', () => {
      // Zygzak przez miasto: Koloseum -> Watykan (drugi koniec) -> Trevi (środek) -> Schody -> Panteon
      const points = [colosseum, vatican, trevi, spanishSteps, pantheon];
      const result = optimizeSightseeingRoute(points, true);

      expect(result.orderedPoints.length).toBe(5);
      expect(result.originalDistanceKm).toBeGreaterThan(0);
      expect(result.optimizedDistanceKm).toBeLessThanOrEqual(result.originalDistanceKm);
      expect(result.savingsKm).toBeGreaterThanOrEqual(0);
      expect(result.timeSavedMinutes).toBeGreaterThanOrEqual(0);

      // Sprawdzenie tabeli benchmarków do pracy inżynierskiej
      expect(result.benchmarks.length).toBeGreaterThanOrEqual(3);
      const benchmarkIds = result.benchmarks.map((b) => b.algorithmId);
      expect(benchmarkIds).toContain('greedy');
      expect(benchmarkIds).toContain('2opt');
      expect(benchmarkIds).toContain('simulated_annealing');
      expect(benchmarkIds).toContain('brute_force'); // Ponieważ N = 5 <= 8
    });

    test('Powinien bezpiecznie obsłużyć puste wejście lub pojedynczy punkt', () => {
      const singleRes = optimizeSightseeingRoute([colosseum]);
      expect(singleRes.orderedPoints.length).toBe(1);
      expect(singleRes.originalDistanceKm).toBe(0);
      expect(singleRes.savingsKm).toBe(0);
    });
  });

  describe('4. Przeliczanie godzin planu dnia (recalculateItineraryTimes)', () => {
    test('Powinien przypisać rosnące, poprawne godziny w formacie HH:MM', () => {
      const mockEvents = [
        { id: '1', type: 'ATTRACTION', title: 'Koloseum', dateStr: '10-10-2026', parsedDate: new Date() },
        { id: '2', type: 'ATTRACTION', title: 'Panteon', dateStr: '10-10-2026', parsedDate: new Date() },
        { id: '3', type: 'ATTRACTION', title: 'Watykan', dateStr: '10-10-2026', parsedDate: new Date() },
      ];

      const recalculated = recalculateItineraryTimes(mockEvents, 10, 0);

      expect(recalculated[0].timeStr).toBe('10:00');
      expect(recalculated[1].timeStr).toBe('11:50');
      expect(recalculated[2].timeStr).toBe('13:40');

      // Walidacja poprawności formatu HH:MM (00:00 - 23:59)
      recalculated.forEach((evt) => {
        expect(evt.timeStr).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      });
    });
  });

  describe('5. Realistyczne Szacowanie Czasu Dojazdu (Pieszo, Komunikacja, Auto)', () => {
    test('Powinien wyznaczyć realistyczne czasy pieszo, komunikacją i autem między Koloseum a Watykanem', () => {
      const estimates = calculateTransitEstimates(colosseum, vatican);

      // Odległość w linii prostej to ~3.43 km, w siatce ulic ~4.8 km
      expect(estimates.straightDistanceKm).toBeCloseTo(3.43, 1);
      expect(estimates.walkDistanceKm).toBeGreaterThan(4.0);
      expect(estimates.walkDistanceKm).toBeLessThan(6.0);

      // Czas pieszo w Google Maps dla ~4.8 km to ok. 65-80 min
      expect(estimates.walkMinutes).toBeGreaterThanOrEqual(60);
      expect(estimates.walkMinutes).toBeLessThanOrEqual(95);

      // Czas komunikacją miejską (metro/autobus z przesiadką/dojściem): ~25-35 min
      expect(estimates.transitMinutes).toBeGreaterThanOrEqual(20);
      expect(estimates.transitMinutes).toBeLessThanOrEqual(40);

      // Czas autem/taxi w centrum: ~15-25 min
      expect(estimates.driveMinutes).toBeGreaterThanOrEqual(12);
      expect(estimates.driveMinutes).toBeLessThanOrEqual(25);
    });

    test('Powinien poprawnie skonstruować link do Google Maps z dokładnymi współrzędnymi obu punktów', () => {
      const walkUrl = buildGoogleMapsDirectionsUrl(colosseum, pantheon, 'walking');
      expect(walkUrl).toContain('travelmode=walking');
      expect(walkUrl).toContain(`origin=${colosseum.lat},${colosseum.lon}`);
      expect(walkUrl).toContain(`destination=${pantheon.lat},${pantheon.lon}`);

      const transitUrl = buildGoogleMapsDirectionsUrl(colosseum, vatican, 'transit');
      expect(transitUrl).toContain('travelmode=transit');

      const driveUrl = buildGoogleMapsDirectionsUrl(colosseum, vatican, 'driving');
      expect(driveUrl).toContain('travelmode=driving');
    });

    test('Powinien poprawnie wyznaczyć czasy dotarcia i link nawigacji dla Sagrada Família i La Pedrera - Casa Milà w Barcelonie', () => {
      const sagradaCoords = resolvePointCoordinates('Sagrada Família', [], 'Barcelona');
      const casaMilaCoords = resolvePointCoordinates('La Pedrera - Casa Milà', [], 'Barcelona');

      expect(sagradaCoords.lat).toBeCloseTo(41.4036, 3);
      expect(sagradaCoords.lon).toBeCloseTo(2.1744, 3);
      expect(casaMilaCoords.lat).toBeCloseTo(41.3953, 3);
      expect(casaMilaCoords.lon).toBeCloseTo(2.1618, 3);

      const estimates = calculateTransitEstimates(sagradaCoords, casaMilaCoords);
      // Pieszo: ~22-23 min
      expect(estimates.walkMinutes).toBeGreaterThanOrEqual(21);
      expect(estimates.walkMinutes).toBeLessThanOrEqual(24);
      // Komunikacja: ~9 min
      expect(estimates.transitMinutes).toBe(9);
      // Auto: ~9 min
      expect(estimates.driveMinutes).toBe(9);

      // Link do Google Maps z nazwami zabytków i miastem
      const mapUrl = buildGoogleMapsDirectionsUrl(
        { ...sagradaCoords, title: 'Sagrada Família' },
        { ...casaMilaCoords, title: 'La Pedrera - Casa Milà' },
        'walking',
        'Barcelona'
      );
      expect(mapUrl).toContain('origin=Sagrada%20Fam%C3%ADlia%2C%20Barcelona');
      expect(mapUrl).toContain('destination=La%20Pedrera%20-%20Casa%20Mil%C3%A0%2C%20Barcelona');
      expect(mapUrl).toContain('travelmode=walking');
    });
  });
});
