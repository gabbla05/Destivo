// __tests__/tests_RouteOptimization.test.ts
import {
  haversineDistance,
  buildDistanceMatrix,
  calculatePathDistance,
  solveGreedyTSP,
  solveTwoOptTSP,
  solveRelocateTSP,
  solveSimulatedAnnealingTSP,
  solveBruteForceTSP,
  optimizeSightseeingRoute,
  optimizeSightseeingRouteWithRoadNetwork,
  fetchOsrmRoadMatrix,
  validateCostMatrix,
  validateOsrmCacheMatrix,
  isPermutation,
  applyRelocateMove,
  optimizeDayRouteWithHotel,
  OsrmMatrixCache,
  OSRM_MATRIX_CACHE,
  recalculateItineraryTimes,
  calculateTransitEstimates,
  buildGoogleMapsDirectionsUrl,
  resolvePointCoordinates,
  getDeterministicCoordinateOffset,
  findIntelligentInsertionSlot,
  insertTimelineEventIntelligently,
  optimizeMultiDayTimeline,
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

  describe('5. Inteligentne wstawianie punktu do osi czasu', () => {
    test('Nigdy nie powinien dodawać punktu do dnia z przeszłości, gdy dostępne są dni przyszłe/obecne', () => {
      const pastDate = '01-01-2020';
      const futureDate1 = '10-10-2029';
      const futureDate2 = '11-10-2029';

      const mockEvents = [
        {
          id: 'evt_1',
          type: 'ATTRACTION',
          title: 'Koloseum',
          dateStr: pastDate,
          timeStr: '10:00',
          lat: 41.8902,
          lon: 12.4922,
        },
        {
          id: 'evt_2',
          type: 'ATTRACTION',
          title: 'Panteon',
          dateStr: futureDate1,
          timeStr: '10:00',
          lat: 41.8986,
          lon: 12.4769,
        },
        {
          id: 'evt_3',
          type: 'ATTRACTION',
          title: 'Schody Hiszpańskie',
          dateStr: futureDate2,
          timeStr: '10:00',
          lat: 41.9060,
          lon: 12.4828,
        },
      ];

      // Nowy punkt geograficznie leży tuż obok Koloseum (które było w przeszłości)
      const newPointNearColosseum = {
        id: 'new_attr',
        title: 'Forum Romanum',
        lat: 41.8925,
        lon: 12.4853,
      };

      // Wywołujemy z defaultDateStr wskazującym na przeszły dzień (np. start_date wyjazdu)
      const result = findIntelligentInsertionSlot(
        mockEvents,
        newPointNearColosseum,
        [],
        'Rzym',
        undefined,
        undefined,
        pastDate
      );

      // Punkt NIE MOŻE zostać dodany do dnia z przeszłości!
      expect(result.dateStr).not.toBe(pastDate);
      expect(result.dateStr).toBe(futureDate1);
    });

    test('Powinien wstawić punkt w miejsce minimalizujące objazd (po drodze między punktami)', () => {
      const testDate = '15-05-2029';
      // Trasa w linii prostej na osi: Punkt A (0,0), Punkt C (0, 0.04)
      // Dodawany punkt B jest dokładnie w połowie (0, 0.02)
      const eventsOnDay = [
        {
          id: 'evt_A',
          type: 'ATTRACTION',
          title: 'Punkt A',
          dateStr: testDate,
          timeStr: '10:00',
          lat: 41.8900,
          lon: 12.4800,
        },
        {
          id: 'evt_C',
          type: 'ATTRACTION',
          title: 'Punkt C',
          dateStr: testDate,
          timeStr: '14:00',
          lat: 41.9100,
          lon: 12.4800,
        },
      ];

      const intermediatePoint = {
        id: 'evt_B',
        title: 'Punkt B (po drodze)',
        lat: 41.9000,
        lon: 12.4800,
      };

      const result = findIntelligentInsertionSlot(
        eventsOnDay,
        intermediatePoint,
        [],
        'Rzym',
        undefined,
        undefined,
        testDate
      );

      // Powinien wstawić między A i C (indeks 1)
      expect(result.insertIndex).toBe(1);
      expect(result.dateStr).toBe(testDate);
      expect(result.timeStr).toBe('12:00'); // Połowa między 10:00 a 14:00
    });

    test('Gdy na danym dniu został już tylko nocleg lub zwiedzanie się zakończyło, powinien dodać atrakcję na kolejny dzień', () => {
      const now = new Date();
      const todayStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
      const nextDay = new Date(now.getTime() + 86400000);
      const tomorrowStr = `${String(nextDay.getDate()).padStart(2, '0')}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${nextDay.getFullYear()}`;

      const eventsWithOnlyLodgingLeft = [
        {
          id: 'evt_past_1',
          type: 'ATTRACTION',
          title: 'Muzeum',
          dateStr: todayStr,
          timeStr: '09:00',
          isPast: true,
          lat: 41.8900,
          lon: 12.4800,
        },
        {
          id: 'evt_lodging',
          type: 'LODGING',
          title: 'Hotel Roma - Nocleg',
          dateStr: todayStr,
          timeStr: '20:00',
          lat: 41.8920,
          lon: 12.4820,
        },
        {
          id: 'evt_tomorrow_1',
          type: 'ATTRACTION',
          title: 'Watykan',
          dateStr: tomorrowStr,
          timeStr: '10:00',
          lat: 41.9029,
          lon: 12.4534,
        },
      ];

      const newAttraction = {
        id: 'new_attr',
        title: 'Koloseum',
        lat: 41.8902,
        lon: 12.4922,
      };

      const result = findIntelligentInsertionSlot(
        eventsWithOnlyLodgingLeft,
        newAttraction,
        [],
        'Rzym',
        undefined,
        undefined,
        todayStr
      );

      // Zamiast wstawiać po nocy na siłę po noclegu na dzisiaj, powinno przenieść na jutro!
      expect(result.dateStr).toBe(tomorrowStr);
    });

    test('Nigdy nie powinien wstawiać atrakcji po noclegu na tym samym dniu', () => {
      const futureDate = '20-11-2029';
      const eventsWithLodging = [
        {
          id: 'evt_sightseeing_1',
          type: 'ATTRACTION',
          title: 'Zwiedzanie Rynku',
          dateStr: futureDate,
          timeStr: '10:00',
          lat: 41.8900,
          lon: 12.4800,
        },
        {
          id: 'evt_hotel',
          type: 'LODGING',
          title: 'Zameldowanie w hotelu',
          dateStr: futureDate,
          timeStr: '20:00',
          lat: 41.8920,
          lon: 12.4820,
        },
      ];

      const newSpot = {
        id: 'new_spot',
        title: 'Restauracja i kolacja',
        lat: 41.8910,
        lon: 12.4810,
      };

      const result = findIntelligentInsertionSlot(
        eventsWithLodging,
        newSpot,
        [],
        'Rzym',
        undefined,
        undefined,
        futureDate
      );

      // Slot MUSI być przed noclegiem (indeks <= 1), a godzina przed noclegiem (przed 20:00)
      expect(result.insertIndex).toBeLessThanOrEqual(1);
      const hours = parseInt(result.timeStr.split(':')[0], 10);
      expect(hours).toBeLessThan(20);
    });

    test('insertTimelineEventIntelligently nigdy nie umieszcza atrakcji po noclegu, nawet gdy modal miał ustawioną późną godzinę (np. 22:00)', () => {
      const today = new Date();
      const day1Str = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
      const day2Date = new Date(today.getTime() + 86400000);
      const day2Str = `${String(day2Date.getDate()).padStart(2, '0')}-${String(day2Date.getMonth() + 1).padStart(2, '0')}-${day2Date.getFullYear()}`;

      const events = [
        {
          id: 'evt_dep',
          type: 'DEPARTURE',
          title: 'Wylot do Rzymu',
          dateStr: day1Str,
          timeStr: '08:00',
          parsedDate: new Date(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}T08:00:00`),
        },
        {
          id: 'evt_hotel_d1',
          type: 'LODGING',
          title: 'Hotel Colosseum',
          dateStr: day1Str,
          timeStr: '20:00',
          parsedDate: new Date(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}T20:00:00`),
        },
        {
          id: 'evt_ret_d2',
          type: 'RETURN',
          title: 'Powrót do Warszawy',
          dateStr: day2Str,
          timeStr: '19:00',
          parsedDate: new Date(`${day2Date.getFullYear()}-${day2Date.getMonth() + 1}-${day2Date.getDate()}T19:00:00`),
        },
      ];

      const newPoolCandidate = {
        id: 'new_attr_pool',
        title: 'Fontanna di Trevi',
        dateStr: day1Str,
        timeStr: '22:00', // Symulujemy formularz, który miał 22:00
        isFromPool: true,
      };

      const result = insertTimelineEventIntelligently(
        events,
        newPoolCandidate,
        [],
        'Rzym',
        'Hotel Colosseum',
        'flight',
        day1Str
      );

      const added = result.find((e) => e.title === 'Fontanna di Trevi');
      expect(added).toBeTruthy();

      // Jeśli dodano na dzień 1, MUSI być przed hotelem:
      const hotelIndex = result.findIndex((e) => e.id === 'evt_hotel_d1');
      const addedIndex = result.findIndex((e) => e.title === 'Fontanna di Trevi');

      if (added!.dateStr === day1Str) {
        expect(addedIndex).toBeLessThan(hotelIndex);
      } else {
        // Jeśli dzień 1 był wyczerpany, powinno przenieść na dzień 2:
        expect(added!.dateStr).toBe(day2Str);
      }
    });

    test('optimizeMultiDayTimeline nigdy nie miesza dni i przypisuje atrakcjom właściwe daty poszczególnych dni', () => {
      const day1 = '10-09-2026';
      const day2 = '11-09-2026';
      const day3 = '12-09-2026';

      // Symulujemy wyjazd z pomieszanymi atrakcjami
      const multiDayEvents = [
        {
          id: 'evt_dep',
          type: 'DEPARTURE',
          title: 'Wylot do Rzymu',
          dateStr: day1,
          timeStr: '08:00',
          parsedDate: new Date('2026-09-10T08:00:00Z'),
        },
        {
          id: 'evt_attr_1',
          type: 'ATTRACTION',
          title: 'Koloseum',
          dateStr: day1,
          timeStr: '10:00',
          parsedDate: new Date('2026-09-10T10:00:00Z'),
          lat: 41.8902,
          lon: 12.4922,
        },
        {
          id: 'evt_hotel_1',
          type: 'LODGING',
          title: 'Hotel Rzym',
          dateStr: day1,
          timeStr: '20:00',
          parsedDate: new Date('2026-09-10T20:00:00Z'),
        },
        {
          id: 'evt_attr_2',
          type: 'ATTRACTION',
          title: 'Watykan',
          dateStr: day2,
          timeStr: '10:00',
          parsedDate: new Date('2026-09-11T10:00:00Z'),
          lat: 41.9022,
          lon: 12.4539,
        },
        {
          id: 'evt_attr_3',
          type: 'ATTRACTION',
          title: 'Bazylika św. Piotra',
          dateStr: day2,
          timeStr: '12:00',
          parsedDate: new Date('2026-09-11T12:00:00Z'),
          lat: 41.9022,
          lon: 12.4539,
        },
        {
          id: 'evt_attr_4',
          type: 'ATTRACTION',
          title: 'Panteon',
          dateStr: day3,
          timeStr: '10:00',
          parsedDate: new Date('2026-09-12T10:00:00Z'),
          lat: 41.8986,
          lon: 12.4769,
        },
        {
          id: 'evt_attr_5',
          type: 'ATTRACTION',
          title: 'Fontanna di Trevi',
          dateStr: day3,
          timeStr: '12:00',
          parsedDate: new Date('2026-09-12T12:00:00Z'),
          lat: 41.9009,
          lon: 12.4833,
        },
        {
          id: 'evt_ret',
          type: 'RETURN',
          title: 'Powrót do Warszawy',
          dateStr: day3,
          timeStr: '18:00',
          parsedDate: new Date('2026-09-12T18:00:00Z'),
        },
      ];

      const result = optimizeMultiDayTimeline({
        events: multiDayEvents,
        targetDay: 'ALL',
        destinationCity: 'Rome',
      });

      // 1. Sprawdzamy czy żaden punkt nie zniknął
      expect(result.length).toBe(multiDayEvents.length);

      // 2. Sprawdzamy czy punkty są ściśle uporządkowane chronologicznie
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].parsedDate.getTime()).toBeLessThanOrEqual(result[i + 1].parsedDate.getTime());
      }

      // 3. Sprawdzamy czy atrakcje na Dzień 1 mają dateStr Dnia 1, na Dzień 2 Dnia 2, itd.
      const day1Attractions = result.filter((e) => e.type === 'ATTRACTION' && e.dateStr === day1);
      const day2Attractions = result.filter((e) => e.type === 'ATTRACTION' && e.dateStr === day2);
      const day3Attractions = result.filter((e) => e.type === 'ATTRACTION' && e.dateStr === day3);

      expect(day1Attractions.length).toBeGreaterThan(0);
      expect(day2Attractions.length).toBeGreaterThan(0);
      expect(day3Attractions.length).toBeGreaterThan(0);

      // Żadna atrakcja z Dnia 2 nie może mieć dateStr Dnia 1 ani pojawić się przed Dniem 1:
      const day1Indices = result.map((e, idx) => (e.dateStr === day1 ? idx : -1)).filter((idx) => idx !== -1);
      const day2Indices = result.map((e, idx) => (e.dateStr === day2 ? idx : -1)).filter((idx) => idx !== -1);
      const day3Indices = result.map((e, idx) => (e.dateStr === day3 ? idx : -1)).filter((idx) => idx !== -1);

      expect(Math.max(...day1Indices)).toBeLessThan(Math.min(...day2Indices));
      expect(Math.max(...day2Indices)).toBeLessThan(Math.min(...day3Indices));

      // 4. Lodging na Dniu 1 musi być po atrakcjach z Dnia 1
      const hotelIndex = result.findIndex((e) => e.id === 'evt_hotel_1');
      for (const d1Attr of day1Attractions) {
        const d1Idx = result.findIndex((e) => e.id === d1Attr.id);
        expect(d1Idx).toBeLessThan(hotelIndex);
      }

      // 5. Return na Dniu 3 musi być na końcu
      const returnIndex = result.findIndex((e) => e.id === 'evt_ret');
      expect(returnIndex).toBe(result.length - 1);
    });

    test('optimizeMultiDayTimeline w trybie pojedynczego dnia modyfikuje wyłącznie wybrany dzień', () => {
      const day1 = '10-09-2026';
      const day2 = '11-09-2026';

      const events = [
        {
          id: 'evt_d1',
          type: 'ATTRACTION',
          title: 'Koloseum',
          dateStr: day1,
          timeStr: '10:00',
          parsedDate: new Date('2026-09-10T10:00:00Z'),
          lat: 41.8902,
          lon: 12.4922,
        },
        {
          id: 'evt_d2_1',
          type: 'ATTRACTION',
          title: 'Watykan',
          dateStr: day2,
          timeStr: '10:00',
          parsedDate: new Date('2026-09-11T10:00:00Z'),
          lat: 41.9022,
          lon: 12.4539,
        },
        {
          id: 'evt_d2_2',
          type: 'ATTRACTION',
          title: 'Panteon',
          dateStr: day2,
          timeStr: '14:00',
          parsedDate: new Date('2026-09-11T14:00:00Z'),
          lat: 41.8986,
          lon: 12.4769,
        },
      ];

      const result = optimizeMultiDayTimeline({
        events,
        targetDay: day2,
        destinationCity: 'Rome',
      });

      // Dzień 1 nienaruszony
      const d1Item = result.find((e) => e.id === 'evt_d1');
      expect(d1Item?.dateStr).toBe(day1);
      expect(d1Item?.timeStr).toBe('10:00');

      // Dzień 2 zoptymalizowany
      const d2Items = result.filter((e) => e.dateStr === day2);
      expect(d2Items.length).toBe(2);
      expect(d2Items[0].dateStr).toBe(day2);
      expect(d2Items[1].dateStr).toBe(day2);
    });
  });

  describe('8. Eliminacja kolapsu współrzędnych i deterministyczna dyspersja (Fix 2.4)', () => {
    test('getDeterministicCoordinateOffset zwraca stabilne, niezerowe przesunięcia różne dla różnych tytułów', () => {
      const offset1 = getDeterministicCoordinateOffset('Lokalna Piekarnia');
      const offset2 = getDeterministicCoordinateOffset('Stary Młyn Wodny');
      const offset3 = getDeterministicCoordinateOffset('Lokalna Piekarnia'); // identyczny tytuł

      // Identyczny tytuł daje dokładnie identyczne przesunięcie (determinizm)
      expect(offset1.latOffset).toBe(offset3.latOffset);
      expect(offset1.lonOffset).toBe(offset3.lonOffset);

      // Różne tytuły dają różne przesunięcia
      expect(offset1.latOffset !== offset2.latOffset || offset1.lonOffset !== offset2.lonOffset).toBe(true);

      // Przesunięcie nie może wynosić 0 (promień 350m - 1200m)
      expect(Math.abs(offset1.latOffset)).toBeGreaterThan(0.001);
      expect(Math.abs(offset1.lonOffset)).toBeGreaterThan(0.001);
      expect(Math.abs(offset2.latOffset)).toBeGreaterThan(0.001);
      expect(Math.abs(offset2.lonOffset)).toBeGreaterThan(0.001);
    });

    test('resolvePointCoordinates dla nieznanych punktów offline w małej miejscowości przypisuje rozproszone punkty (dystans > 100m)', () => {
      const coords1 = resolvePointCoordinates('Nieznana Galeria Sztuki', [], 'Kazimierz Dolny');
      const coords2 = resolvePointCoordinates('Ukryta Kawiarnia w Ogrodzie', [], 'Kazimierz Dolny');

      expect(coords1).not.toBeNull();
      expect(coords2).not.toBeNull();

      // Odległość między dwoma nieznanymi punktami w Kazimierzu Dolnym NIE może być zerowa (kolaps zlikwidowany)
      const dist = haversineDistance(coords1.lat, coords1.lon, coords2.lat, coords2.lon);
      expect(dist).toBeGreaterThan(0.1); // Co najmniej 100 metrów
      expect(dist).toBeLessThan(5.0); // W rozsądnym zasięgu miejscowości
    });

    test('optimizeSightseeingRoute wykrywa zbieżne/zbite współrzędne i ustawia hasCollapsedCoordinates: true', () => {
      // 3 punkty o dokładnie tych samych współrzędnych
      const identicalPoints = [
        { id: 'p1', title: 'Punkt 1', lat: 50.0647, lon: 19.9450 },
        { id: 'p2', title: 'Punkt 2', lat: 50.0647, lon: 19.9450 },
        { id: 'p3', title: 'Punkt 3', lat: 50.0647, lon: 19.9450 },
      ];

      const result = optimizeSightseeingRoute(identicalPoints);
      expect(result.hasCollapsedCoordinates).toBe(true);
      expect(result.orderedPoints.length).toBe(3);
    });

    test('optimizeSightseeingRoute ustawia hasCollapsedCoordinates: false dla zróżnicowanych punktów', () => {
      const distinctPoints = [
        colosseum,
        pantheon,
        trevi,
      ];

      const result = optimizeSightseeingRoute(distinctPoints);
      expect(result.hasCollapsedCoordinates).toBe(false);
      expect(result.orderedPoints.length).toBe(3);
    });
  });

  describe('10. OSRM Table API i Optymalizacja Drogowa (Sieć Drogowa OSM)', () => {
    const ptA: GeoPoint = { id: 'pt_a', title: 'Punkt A', lat: 41.8900, lon: 12.4900 };
    const ptB: GeoPoint = { id: 'pt_b', title: 'Punkt B', lat: 41.8950, lon: 12.4850 };
    const ptC: GeoPoint = { id: 'pt_c', title: 'Punkt C', lat: 41.9000, lon: 12.4800 };

    beforeEach(() => {
      OSRM_MATRIX_CACHE.clear();
      jest.restoreAllMocks();
    });

    test('fetchOsrmRoadMatrix przygotowuje zapytanie z kolejnością lon,lat i annotations=duration,distance', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        expect(url).toContain('/table/v1/driving/');
        // Wymóg OSRM: longitude,latitude
        expect(url).toContain('12.49,41.89;12.485,41.895;12.48,41.9');
        expect(url).toContain('annotations=duration,distance');

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 300, 600],
              [310, 0, 250],
              [620, 260, 0],
            ],
            distances: [
              [0, 1500, 3200],
              [1550, 0, 1200],
              [3300, 1250, 0],
            ],
          }),
        } as Response;
      });

      const res = await fetchOsrmRoadMatrix([ptA, ptB, ptC], { criterion: 'duration', profile: 'driving' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.matrix.length).toBe(3);
      expect(res.matrix[0][1]).toBe(300);
      expect(res.matrix[1][2]).toBe(250);
      expect(res.criterion).toBe('duration');
      expect(res.isApproximate).toBe(false);
    });

    test('fetchOsrmRoadMatrix obsługuje kryterium distance zwracając metry', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'Ok',
          durations: [
            [0, 300],
            [300, 0],
          ],
          distances: [
            [0, 2450],
            [2400, 0],
          ],
        }),
      } as Response);

      const res = await fetchOsrmRoadMatrix([ptA, ptB], { criterion: 'distance' });
      expect(res.criterion).toBe('distance');
      expect(res.matrix[0][1]).toBe(2450);
      expect(res.matrix[1][0]).toBe(2400);
    });

    test('fetchOsrmRoadMatrix rzuca błąd przy niepoprawnych współrzędnych bez wysyłania zapytania', async () => {
      const invalidPoint: GeoPoint = { id: 'inv', title: 'Niepoprawny', lat: NaN, lon: 200 };
      const spyFetch = jest.spyOn(global, 'fetch');

      await expect(fetchOsrmRoadMatrix([ptA, invalidPoint])).rejects.toThrow(
        /Niepoprawne współrzędne geograficzne punktu/i
      );
      expect(spyFetch).not.toHaveBeenCalled();
    });

    test('fetchOsrmRoadMatrix jawnie wykrywa null (brak trasy/odcinek nieprzejezdny) i rzuca OSRM_UNREACHABLE_POINTS bez używania Infinity', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'Ok',
          durations: [
            [0, null], // Punkt B jest nieosiągalny z Punktu A (np. odcięta wyspa)
            [null, 0],
          ],
        }),
      } as Response);

      await expect(fetchOsrmRoadMatrix([ptA, ptB])).rejects.toThrow(/OSRM_UNREACHABLE_POINTS/i);
    });

    test('fetchOsrmRoadMatrix rzuca czytelny błąd przy kodzie błędu OSRM lub błędzie HTTP', async () => {
      // 1. Kod błędu OSRM
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'InvalidQuery',
          message: 'Too many coordinates',
        }),
      } as Response);

      await expect(fetchOsrmRoadMatrix([ptA, ptB])).rejects.toThrow(/Serwer OSRM zwrócił kod błędu "InvalidQuery"/i);

      // 2. Błąd HTTP 500
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(fetchOsrmRoadMatrix([ptA, ptB])).rejects.toThrow(/błąd HTTP 500/i);
    });

    test('Kolejność optymalna według sieci drogowej różni się od kolejności według odległości w linii prostej (Haversine)', () => {
      // Scenariusz: Rzeka z mostem
      // Start S = (0, 0)
      // Cel 1 (druga strona rzeki bez mostu w pobliżu): linia prosta = 1.0 km, ale drogą 30 km (1800 s)
      // Cel 2 (po tej samej stronie rzeki): linia prosta = 2.0 km, ale drogą tylko 2.2 km (180 s)
      // Cel 3 (blisko Celu 2): linia prosta = 2.5 km, drogą 2.7 km (220 s)
      const startPt: GeoPoint = { id: 's', title: 'Start', lat: 41.8900, lon: 12.4900 };
      const acrossRiver: GeoPoint = { id: 'river', title: 'Za rzeką', lat: 41.8980, lon: 12.4900 }; // Bliżej w Haversine
      const nearCity: GeoPoint = { id: 'city', title: 'W mieście', lat: 41.9100, lon: 12.4900 };    // Dalej w Haversine

      const points = [startPt, acrossRiver, nearCity];

      // 1. Wyznaczenie trasy czystym Haversine (bez macierzy OSRM)
      const straightResult = optimizeSightseeingRoute(points, true);
      // W linii prostej z Punktu S najbliżej jest do acrossRiver (indeks 1), więc kolejność to [0, 1, 2]
      expect(straightResult.orderedPoints[0].id).toBe('s');
      expect(straightResult.orderedPoints[1].id).toBe('river');

      // 2. Kontrolowana macierz czasów drogowych OSRM (w sekundach)
      // [S, River, City]
      const roadTimeMatrix: number[][] = [
        [0, 1800, 200],   // Z S do River aż 1800 s (brak mostu!), ale do City tylko 200 s!
        [1800, 0, 1900],  // Z River
        [200, 1900, 0],   // Z City
      ];

      // 3. Wyznaczenie trasy z macierzą OSRM
      const roadResult = optimizeSightseeingRoute(points, true, {
        customMatrix: roadTimeMatrix,
        criterion: 'duration',
        isApproximate: false,
      });

      // Z macierzą drogową algorytmy wybierają [S, City, River], ponieważ czas 200 + 1900 = 2100 s
      // jest znacznie mniejszy niż 1800 + 1900 = 3700 s!
      expect(roadResult.orderedPoints[0].id).toBe('s');
      expect(roadResult.orderedPoints[1].id).toBe('city');
      expect(roadResult.orderedPoints[2].id).toBe('river');
      expect(roadResult.isApproximate).toBe(false);
      expect(roadResult.criterion).toBe('duration');
    });

    test('Wszystkie algorytmy (Greedy, 2-Opt, Simulated Annealing, Brute Force) minimalizują czas z macierzy drogowej', () => {
      // 4 punkty z asymetryczną macierzą czasów przejazdu
      const p1: GeoPoint = { id: '1', title: 'P1', lat: 41.89, lon: 12.49 };
      const p2: GeoPoint = { id: '2', title: 'P2', lat: 41.90, lon: 12.50 };
      const p3: GeoPoint = { id: '3', title: 'P3', lat: 41.91, lon: 12.51 };
      const p4: GeoPoint = { id: '4', title: 'P4', lat: 41.92, lon: 12.52 };
      const points = [p1, p2, p3, p4];

      const roadMatrix: number[][] = [
        [0, 450, 120, 800],
        [430, 0, 500, 150],
        [110, 490, 0, 320],
        [820, 160, 310, 0],
      ];

      // Test każdego algorytmu bezpośrednio na macierzy drogowej
      const greedy = solveGreedyTSP(roadMatrix, 0);
      expect(greedy.route[0]).toBe(0);
      expect(greedy.distance).toBeGreaterThan(0);
      // Greedy z 0: najtańszy następny to indeks 2 (koszt 120)
      expect(greedy.route[1]).toBe(2);

      const twoOpt = solveTwoOptTSP([0, 1, 2, 3], roadMatrix, true);
      expect(twoOpt.distance).toBeLessThanOrEqual(calculatePathDistance([0, 1, 2, 3], roadMatrix));

      const sa = solveSimulatedAnnealingTSP([0, 1, 2, 3], roadMatrix, true);
      expect(sa.route.length).toBe(4);
      expect(sa.distance).toBeGreaterThan(0);

      const bf = solveBruteForceTSP(roadMatrix, true);
      expect(bf).not.toBeNull();
      expect(bf!.distance).toBeLessThanOrEqual(greedy.distance);

      // Pełny przebieg
      const full = optimizeSightseeingRoute(points, true, roadMatrix, 'duration');
      expect(full.bestAlgorithm.costUnit).toBe('seconds');
      expect(full.orderedPoints.length).toBe(4);
    });

    test('optimizeMultiDayTimeline z precomputedOrderedPoints zachowuje ułożenie OSRM i nie przelicza Haversine', () => {
      const events = [
        {
          id: 'ev_1',
          type: 'ATTRACTION',
          title: 'Punkt 1',
          dateStr: '10-10-2026',
          timeStr: '10:00',
          parsedDate: new Date('2026-10-10T10:00:00Z'),
          lat: 41.89,
          lon: 12.49,
        },
        {
          id: 'ev_2',
          type: 'ATTRACTION',
          title: 'Punkt 2',
          dateStr: '10-10-2026',
          timeStr: '12:00',
          parsedDate: new Date('2026-10-10T12:00:00Z'),
          lat: 41.90,
          lon: 12.50,
        },
      ];

      // Załóżmy, że OSRM ustalił odwróconą kolejność [ev_2, ev_1]
      const precomputed: GeoPoint[] = [
        { id: 'ev_2', title: 'Punkt 2', lat: 41.90, lon: 12.50 },
        { id: 'ev_1', title: 'Punkt 1', lat: 41.89, lon: 12.49 },
      ];

      const res = optimizeMultiDayTimeline({
        events,
        targetDay: '10-10-2026',
        precomputedOrderedPoints: precomputed,
        isApproximateMode: false,
      });

      const attractions = res.filter((e) => e.type === 'ATTRACTION');
      expect(attractions[0].id).toBe('ev_2');
      expect(attractions[1].id).toBe('ev_1');
    });

    test('solveTwoOptTSP na asymetrycznej macierzy (ATSP) wykorzystuje operator Relocate, gdy odwrócenie krawędzi (2-opt) jest zablokowane przez ulicę jednokierunkową', () => {
      // Scenariusz ATSP: 4 wierzchołki, fixStart = true (0 na start)
      // Początkowa trasa: [0, 3, 1, 2]
      // Przejście 2->1 to ulica jednokierunkowa pod prąd (koszt 99999)
      const atspMatrix: number[][] = [
        [0, 10, 50, 100],      // 0 -> 1: 10, 0 -> 3: 100
        [50, 0, 10, 50],       // 1 -> 2: 10
        [50, 99999, 0, 10],    // 2 -> 1: 99999 (jednokierunkowa!), 2 -> 3: 10
        [10, 50, 50, 0],       // 3 -> 0: 10
      ];

      // Standardowe 2-opt odwracające sub-sekwencję [3, 1, 2] do [2, 1, 3] musiałoby przejść 2->1 (koszt 99999).
      // Operator Relocate przesuwa wierzchołek 3 za wierzchołek 2 -> [0, 1, 2, 3] z kosztem 10+10+10 = 30.
      const initialRoute = [0, 3, 1, 2];
      const opt = solveTwoOptTSP(initialRoute, atspMatrix, true);
      expect(opt.route).toEqual([0, 1, 2, 3]);
      expect(opt.distance).toBe(30);
    });

    test('validateCostMatrix precyzyjnie wykrywa nieprawidłowości macierzy (brak tablicy, zły rozmiar, wartości ujemne, NaN, brakujące wiersze)', () => {
      // 1. Nie jest tablicą
      expect(validateCostMatrix(null, 3).valid).toBe(false);
      expect(validateCostMatrix('matrix', 3).valid).toBe(false);

      // 2. Zła liczba wierszy
      expect(validateCostMatrix([[0, 1], [1, 0]], 3).valid).toBe(false);

      // 3. Wiersz nie będący tablicą
      expect(validateCostMatrix([[0, 1], null as any], 2).valid).toBe(false);

      // 4. Zła liczba kolumn w wierszu
      expect(validateCostMatrix([[0, 1], [1]], 2).valid).toBe(false);

      // 5. Wartość ujemna
      expect(validateCostMatrix([[0, -10], [10, 0]], 2).valid).toBe(false);

      // 6. NaN i Infinity
      expect(validateCostMatrix([[0, NaN], [10, 0]], 2).valid).toBe(false);
      expect(validateCostMatrix([[0, Infinity], [10, 0]], 2).valid).toBe(false);

      // 7. Poprawna macierz
      expect(validateCostMatrix([[0, 10], [15, 0]], 2).valid).toBe(true);
    });

    test('fetchOsrmRoadMatrix precyzyjnie formatuje nazwy wszystkich nieosiągalnych par w błędzie OSRM_UNREACHABLE_POINTS', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'Ok',
          durations: [
            [0, null, 100],
            [null, 0, null],
            [100, 200, 0],
          ],
        }),
      } as Response);

      await expect(fetchOsrmRoadMatrix([ptA, ptB, ptC])).rejects.toThrow(
        /Brak połączenia drogowego między wybranymi punktami: "Punkt A" -> "Punkt B", "Punkt B" -> "Punkt A", "Punkt B" -> "Punkt C"/i
      );
    });
  });

  describe('11. Ścisłe testy regresyjne audytu optymalizacji tras (Regresje i Niezmienniki)', () => {
    // 1. Asymetryczna macierz (ATSP): odwrócenie pod-ścieżki drastycznie zwiększa koszt
    test('w asymetrycznej macierzy drogowej odwrócenie fragmentu trasy zwiększa koszt (ulica jednokierunkowa)', () => {
      // 0 -> 1 -> 2 -> 3
      // 1 -> 2: koszt 10
      // 2 -> 1: koszt 5000 (jazda pod prąd/wąska jednokierunkowa)
      const atspMatrix: number[][] = [
        [0, 15, 100, 200],
        [100, 0, 10, 100],
        [100, 5000, 0, 20],
        [100, 100, 100, 0],
      ];

      const directRoute = [0, 1, 2, 3];
      const reversedMidRoute = [0, 2, 1, 3]; // odwrócenie [1, 2] do [2, 1]

      const directCost = calculatePathDistance(directRoute, atspMatrix);
      const reversedCost = calculatePathDistance(reversedMidRoute, atspMatrix);

      expect(directCost).toBe(15 + 10 + 20); // 45
      expect(reversedCost).toBe(100 + 5000 + 100); // 5200
      expect(reversedCost).toBeGreaterThan(directCost * 100);
    });

    // 2. Operator Relocate poprawia wynik tam, gdzie zwykłe 2-opt zawodzi
    test('operator Relocate skutecznie poprawia trasę bez konieczności odwracania kierunków krawędzi', () => {
      const matrix: number[][] = [
        [0, 20, 20, 100],
        [20, 0, 20, 100],
        [20, 10000, 0, 20], // 2 -> 1 zakazane
        [100, 100, 20, 0],
      ];
      // Start: [0, 2, 3, 1]
      // Chcemy przemieścić wierzchołek 1 na odpowiednią pozycję
      const opt = solveTwoOptTSP([0, 2, 3, 1], matrix, true);
      expect(isPermutation(opt.route, 4)).toBe(true);
      expect(opt.route[0]).toBe(0);
      expect(opt.distance).toBeLessThan(calculatePathDistance([0, 2, 3, 1], matrix));
    });

    // 3. Ustalony i swobodny punkt startowy
    test('fixStartPoint zachowuje punkt 0 na pierwszej pozycji, a fixStartPoint = false bada alternatywne początki', () => {
      // Wierzchołek 2 ma unikalnie optymalne przejście 2 -> 0 (koszt 5) -> 1 (koszt 10) = 15
      // Z wierzchołka 0: 0 -> 1 (10) -> 2 (100) = 110
      const matrix: number[][] = [
        [0, 10, 100],
        [100, 0, 100],
        [5, 100, 0],
      ];

      // Dla fixStart = true: punkt 0 MUSI być pierwszy
      const greedyFixed = solveGreedyTSP(matrix, 0);
      expect(greedyFixed.route[0]).toBe(0);

      const twoOptFixed = solveTwoOptTSP([0, 1, 2], matrix, true);
      expect(twoOptFixed.route[0]).toBe(0);

      const saFixed = solveSimulatedAnnealingTSP([0, 1, 2], matrix, true);
      expect(saFixed.route[0]).toBe(0);

      const bfFixed = solveBruteForceTSP(matrix, true);
      expect(bfFixed!.route[0]).toBe(0);
      expect(bfFixed!.distance).toBe(110);

      // Dla fixStart = false: Brute Force i optimizeSightseeingRoute powinny wybrać trasę rozpoczynającą się od 2
      const bfFree = solveBruteForceTSP(matrix, false);
      expect(bfFree!.route[0]).toBe(2);
      expect(bfFree!.route).toEqual([2, 0, 1]);
      expect(bfFree!.distance).toBe(15);

      const pts: GeoPoint[] = [
        { id: 'p0', title: 'P0', lat: 41.89, lon: 12.49 },
        { id: 'p1', title: 'P1', lat: 41.90, lon: 12.50 },
        { id: 'p2', title: 'P2', lat: 41.91, lon: 12.51 },
      ];
      const optFree = optimizeSightseeingRoute(pts, false, matrix, 'duration');
      expect(optFree.orderedPoints[0].id).toBe('p2');
    });

    // 4. Porównywanie kosztów bliskich sobie, ale różnych po zaokrągleniu
    test('algorytmy wybierają tańszą trasę przy kosztach różniących się o ułamek, który zniknąłby po zaokrągleniu', () => {
      // Punkt 0 -> 1 -> 2: koszt 100.04
      // Punkt 0 -> 2 -> 1: koszt 100.01
      // Po toFixed(1) oba wynosiłyby 100.0!
      const matrix: number[][] = [
        [0, 50.02, 50.00],
        [50.02, 0, 50.02],
        [50.00, 50.01, 0],
      ];

      const routeA = [0, 1, 2]; // 50.02 + 50.02 = 100.04
      const routeB = [0, 2, 1]; // 50.00 + 50.01 = 100.01

      expect(calculatePathDistance(routeA, matrix)).toBeCloseTo(100.04, 2);
      expect(calculatePathDistance(routeB, matrix)).toBeCloseTo(100.01, 2);

      const pts: GeoPoint[] = [
        { id: 'a', title: 'A', lat: 41.89, lon: 12.49 },
        { id: 'b', title: 'B', lat: 41.90, lon: 12.50 },
        { id: 'c', title: 'C', lat: 41.91, lon: 12.51 },
      ];

      const res = optimizeSightseeingRoute(pts, true, matrix, 'duration');
      // Musi wybrać routeB [0, 2, 1], czyli ['a', 'c', 'b']
      expect(res.orderedPoints[0].id).toBe('a');
      expect(res.orderedPoints[1].id).toBe('c');
      expect(res.orderedPoints[2].id).toBe('b');
    });

    // 5. Walidacja: algorytmy odrzucają macierze wadliwe
    test('algorytmy TSP walidują wejście i rzucają błąd przy nieprawidłowej macierzy', () => {
      const invalidMatrix = [[0, -5], [5, 0]]; // ujemna wartość
      expect(() => solveGreedyTSP(invalidMatrix)).toThrow(/Niepoprawna macierz kosztów/i);
      expect(() => solveTwoOptTSP([0, 1], invalidMatrix, true)).toThrow(/Niepoprawna macierz kosztów/i);
      expect(() => solveSimulatedAnnealingTSP([0, 1], invalidMatrix, true)).toThrow(/Niepoprawna macierz kosztów/i);
      expect(() => solveBruteForceTSP(invalidMatrix, true)).toThrow(/Niepoprawna macierz kosztów/i);
    });

    // 6. Brute force dla 0, 1, 2 i 8 punktów
    test('solveBruteForceTSP poprawnie obsługuje 0, 1, 2 i 8 punktów', () => {
      // N = 0
      expect(solveBruteForceTSP([])).toEqual({ route: [], distance: 0, iterations: 1, timeMs: 0 });

      // N = 1
      expect(solveBruteForceTSP([[0]])).toEqual({ route: [0], distance: 0, iterations: 1, timeMs: 0 });

      // N = 2
      const m2 = [
        [0, 80],
        [10, 0],
      ];
      // fixStart = true: [0, 1] z kosztem 80
      const bf2Fixed = solveBruteForceTSP(m2, true);
      expect(bf2Fixed!.route).toEqual([0, 1]);
      expect(bf2Fixed!.distance).toBe(80);

      // fixStart = false: [1, 0] z kosztem 10
      const bf2Free = solveBruteForceTSP(m2, false);
      expect(bf2Free!.route).toEqual([1, 0]);
      expect(bf2Free!.distance).toBe(10);

      // N = 8
      const m8: number[][] = Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => (r === c ? 0 : (r + 1) * 10 + c))
      );
      const bf8 = solveBruteForceTSP(m8, true);
      expect(bf8).not.toBeNull();
      expect(bf8!.route.length).toBe(8);
      expect(isPermutation(bf8!.route, 8)).toBe(true);

      // N = 9 (ochrona złożoności)
      const m9: number[][] = Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => (r === c ? 0 : 10))
      );
      expect(solveBruteForceTSP(m9)).toBeNull();
    });

    // 7. Błędy sieciowe, timeouty i błędne odpowiedzi OSRM
    test('fetchOsrmRoadMatrix obsługuje błędy JSON, kody błędów OSRM i timeouty AbortController', async () => {
      const pA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const pB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      // 1. Niepoprawny JSON
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        },
      } as unknown as Response);
      await expect(fetchOsrmRoadMatrix([pA, pB])).rejects.toThrow(/Błąd parsowania odpowiedzi serwera OSRM/i);

      // 2. Kod błędu OSRM NoRoute
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'NoRoute',
          message: 'Impossible route between points',
        }),
      } as unknown as Response);
      await expect(fetchOsrmRoadMatrix([pA, pB])).rejects.toThrow(/Serwer OSRM zwrócił kod błędu "NoRoute"/i);

      // 3. Timeout z AbortController
      jest.spyOn(global, 'fetch').mockImplementationOnce(() => {
        const abortErr = new Error('The user aborted a request.');
        abortErr.name = 'AbortError';
        return Promise.reject(abortErr);
      });
      await expect(fetchOsrmRoadMatrix([pA, pB])).rejects.toThrow(/Przekroczono limit czasu/i);
    });

    // 8. OsrmMatrixCache: TTL, limit wpisów (LRU eviction) i brak kolizji współrzędnych
    test('OsrmMatrixCache poprawnie obsługuje TTL i limit wpisów (LRU eviction)', async () => {
      const testCache = new OsrmMatrixCache(2, 50); // limit 2 wpisy, 50ms TTL
      const dummyRes = {
        matrix: [[0, 10], [10, 0]],
        criterion: 'duration' as const,
        profile: 'driving' as const,
        isApproximate: false,
      };

      testCache.set('k1', dummyRes);
      expect(testCache.has('k1')).toBe(true);
      expect(testCache.get('k1')).toEqual(dummyRes);

      // Test wygaśnięcia TTL
      await new Promise((r) => setTimeout(r, 60));
      expect(testCache.has('k1')).toBe(false);
      expect(testCache.get('k1')).toBeUndefined();

      // Test limitu wpisów (LRU)
      testCache.set('item1', dummyRes);
      testCache.set('item2', dummyRes);
      testCache.set('item3', dummyRes); // powinno usunąć najstarszy 'item1'

      expect(testCache.has('item1')).toBe(false);
      expect(testCache.has('item2')).toBe(true);
      expect(testCache.has('item3')).toBe(true);
      expect(testCache.size).toBe(2);
    });

    test('Współrzędne o minimalnej różnicy nie powodują kolizji w kluczu pamięci podręcznej', () => {
      const p1: GeoPoint = { id: '1', title: '1', lat: 41.8900001, lon: 12.4900001 };
      const p2: GeoPoint = { id: '2', title: '2', lat: 41.8900004, lon: 12.4900004 };

      const key1 = `${p1.lat.toFixed(7)},${p1.lon.toFixed(7)}`;
      const key2 = `${p2.lat.toFixed(7)},${p2.lon.toFixed(7)}`;

      expect(key1).not.toBe(key2);
      expect(key1).toBe('41.8900001,12.4900001');
      expect(key2).toBe('41.8900004,12.4900004');
    });

    // 9. Zgodność raportowanych oszczędności z rzeczywistymi kosztami
    test('raportowane oszczędności są w 100% zgodne z kosztami tras i nie mieszają jednostek', () => {
      const pts: GeoPoint[] = [
        { id: '1', title: '1', lat: 41.89, lon: 12.49 },
        { id: '2', title: '2', lat: 41.90, lon: 12.50 },
        { id: '3', title: '3', lat: 41.91, lon: 12.51 },
      ];

      // Macierz czasu (sekundy): startowa [0, 1, 2] kosztuje 1000 + 1000 = 2000 s
      // Optymalna trasa [0, 2, 1] kosztuje 200 + 400 = 600 s
      const timeMatrix: number[][] = [
        [0, 1000, 200],
        [1000, 0, 1000],
        [200, 400, 0],
      ];

      const resDuration = optimizeSightseeingRoute(pts, true, timeMatrix, 'duration');
      expect(resDuration.costUnit).toBe('seconds');
      expect(resDuration.originalCost).toBe(2000);
      expect(resDuration.optimizedCost).toBe(600);
      expect(resDuration.timeSavedMinutes).toBe(Math.round((2000 - 600) / 60)); // 23 minuty
      expect(resDuration.savingsPercent).toBeCloseTo(((2000 - 600) / 2000) * 100, 1); // 70.0%
      expect(resDuration.optimizedCost).toBeLessThanOrEqual(resDuration.originalCost!);

      // Macierz odległości OSRM (metry): startowa kosztuje 5000 m, optymalna 2000 m
      const meterMatrix: number[][] = [
        [0, 3000, 1000],
        [3000, 0, 1000],
        [1000, 1000, 0],
      ];
      const resMeters = optimizeSightseeingRoute(pts, true, {
        customMatrix: meterMatrix,
        criterion: 'distance',
        isApproximate: false,
      });

      expect(resMeters.costUnit).toBe('meters');
      expect(resMeters.originalCost).toBe(4000); // 0->1: 3000, 1->2: 1000 = 4000
      expect(resMeters.optimizedCost).toBe(2000); // 0->2: 1000, 2->1: 1000 = 2000
      expect(resMeters.savingsPercent).toBeCloseTo(((4000 - 2000) / 4000) * 100, 1); // 50.0%
      expect(resMeters.savingsKm).toBe((4000 - 2000) / 1000); // 2.0 km

      // Tryb przybliżony (Haversine km): weryfikacja spójności matematycznej
      // Zygzak: Koloseum -> Watykan -> Panteon (Watykan i Panteon są dalej od Koloseum niż od siebie)
      const resHaversine = optimizeSightseeingRoute([colosseum, vatican, pantheon], true, undefined, 'distance', true);
      expect(resHaversine.costUnit).toBe('km');
      expect(resHaversine.isApproximate).toBe(true);
      expect(resHaversine.originalCost).toBeGreaterThan(0);
      expect(resHaversine.optimizedCost).toBeLessThanOrEqual(resHaversine.originalCost!);

      const hMat = buildDistanceMatrix([colosseum, vatican, pantheon]);
      const rawOrig = calculatePathDistance([0, 1, 2], hMat);
      const rawOpt = calculatePathDistance([0, 2, 1], hMat);
      const rawSaved = Math.max(0, rawOrig - rawOpt);
      const expectedPercent = Number(((rawSaved / rawOrig) * 100).toFixed(1));

      expect(resHaversine.savingsKm).toBeCloseTo(rawSaved, 2);
      expect(resHaversine.savingsPercent).toBe(expectedPercent);
      // W trybie Haversine czas NIE jest prezentowany jako czas drogowy
      expect(resHaversine.timeSavedMinutes).toBe(0);
      expect(resHaversine.timeEstimateCategory).toBe('none_in_approximate_mode');
    });

    // 10. Ścisły dowód zachowania fixStartPoint i niezmiennika permutacji
    test('wszystkie algorytmy bezwzględnie zachowują fixStartPoint i nie modyfikują zbioru wierzchołków', () => {
      const testSizes = [3, 4, 5];

      for (const N of testSizes) {
        // Asymetryczna macierz losowa ze zróżnicowanymi wagami
        const matrix: number[][] = Array.from({ length: N }, (_, r) =>
          Array.from({ length: N }, (_, c) => (r === c ? 0 : ((r + 1) * 37 + (c + 1) * 19) % 100 + 10))
        );

        const initialRoute = Array.from({ length: N }, (_, i) => i);

        // 1. Greedy
        const greedy = solveGreedyTSP(matrix, 0);
        expect(greedy.route[0]).toBe(0);
        expect(isPermutation(greedy.route, N)).toBe(true);

        // 2. TwoOpt + Relocate
        const twoOpt = solveTwoOptTSP(initialRoute, matrix, true);
        expect(twoOpt.route[0]).toBe(0);
        expect(isPermutation(twoOpt.route, N)).toBe(true);
        expect(twoOpt.distance).toBeLessThanOrEqual(calculatePathDistance(initialRoute, matrix));

        // 3. Simulated Annealing
        const sa = solveSimulatedAnnealingTSP(initialRoute, matrix, true);
        expect(sa.route[0]).toBe(0);
        expect(isPermutation(sa.route, N)).toBe(true);

        // 4. Brute Force
        const bf = solveBruteForceTSP(matrix, true);
        expect(bf).not.toBeNull();
        expect(bf!.route[0]).toBe(0);
        expect(isPermutation(bf!.route, N)).toBe(true);
      }
    });
  });

  describe('12. Audyt i weryfikacja krytyczna: Relocate, metryki, cache immutability i hotel depot', () => {
    // 1. Operator Relocate - testy przypadków granicznych i zachowanie niezmiennika
    test('applyRelocateMove poprawnie obsługuje przesunięcia w lewo, w prawo, na początek i na koniec trasy', () => {
      const initial = [0, 1, 2, 3, 4];

      // A. Ruch tożsamościowy (fromIndex === targetIndex)
      const same = applyRelocateMove(initial, 2, 2);
      expect(same).toEqual([0, 1, 2, 3, 4]);
      expect(isPermutation(same, 5)).toBe(true);

      // B. Przesunięcie w lewo: element 3 na pozycję 1
      const moveLeft = applyRelocateMove(initial, 3, 1);
      expect(moveLeft).toEqual([0, 3, 1, 2, 4]);
      expect(isPermutation(moveLeft, 5)).toBe(true);

      // C. Przesunięcie w prawo: element 1 na pozycję 3
      const moveRight = applyRelocateMove(initial, 1, 3);
      expect(moveRight).toEqual([0, 2, 3, 1, 4]);
      expect(isPermutation(moveRight, 5)).toBe(true);

      // D. Przesunięcie na początek dozwolonego zakresu (np. pozycja 1 przy fixStartPoint)
      const moveToStart = applyRelocateMove(initial, 4, 1);
      expect(moveToStart).toEqual([0, 4, 1, 2, 3]);
      expect(isPermutation(moveToStart, 5)).toBe(true);

      // E. Przesunięcie na sam koniec trasy (pozycja 4)
      const moveToEnd = applyRelocateMove(initial, 1, 4);
      expect(moveToEnd).toEqual([0, 2, 3, 4, 1]);
      expect(isPermutation(moveToEnd, 5)).toBe(true);

      // F. Przesunięcie z pozycji 0 na sam koniec (gdy fixStart = false)
      const moveZeroToEnd = applyRelocateMove(initial, 0, 4);
      expect(moveZeroToEnd).toEqual([1, 2, 3, 4, 0]);
      expect(isPermutation(moveZeroToEnd, 5)).toBe(true);
    });

    // 2. Weryfikacja metryk: koszty równe, zerowe, małe różnice numeryczne
    test('metryki oszczędności poprawnie obsługują koszty równe, zerowe i małe różnice numeryczne', () => {
      const points: GeoPoint[] = [
        { id: '1', title: 'P1', lat: 41.89, lon: 12.49 },
        { id: '2', title: 'P2', lat: 41.90, lon: 12.50 },
      ];

      // A. Koszty równe (trasa nie ulega skróceniu)
      const equalMatrix = [
        [0, 500],
        [500, 0],
      ];
      const resEqual = optimizeSightseeingRoute(points, true, {
        customMatrix: equalMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
      expect(resEqual.originalCost).toBe(500);
      expect(resEqual.optimizedCost).toBe(500);
      expect(resEqual.savingsPercent).toBe(0);
      expect(resEqual.timeSavedMinutes).toBe(0);

      // B. Koszty zerowe (np. punkty o identycznych współrzędnych lub odległość 0)
      const zeroMatrix = [
        [0, 0],
        [0, 0],
      ];
      const resZero = optimizeSightseeingRoute(points, true, {
        customMatrix: zeroMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
      expect(resZero.originalCost).toBe(0);
      expect(resZero.optimizedCost).toBe(0);
      expect(resZero.savingsPercent).toBe(0);
      expect(resZero.timeSavedMinutes).toBe(0);
      expect(Number.isNaN(resZero.savingsPercent)).toBe(false);

      // C. Małe różnice numeryczne (mniejsze niż 1e-9 traktowane jako równe)
      const tinyDiffMatrix = [
        [0, 100.0000000001],
        [100.0000000002, 0],
      ];
      const resTiny = optimizeSightseeingRoute(points, false, {
        customMatrix: tinyDiffMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
      expect(resTiny.optimizedCost).toBeLessThanOrEqual(resTiny.originalCost!);
    });

    // 3. Cache OSRM: odporność na modyfikację (defensive copying / immutability)
    test('OsrmMatrixCache jest odporny na modyfikację z zewnątrz (defensive copying na get i set)', () => {
      const cache = new OsrmMatrixCache(10, 60000);
      const originalMatrix = [
        [0, 100],
        [100, 0],
      ];
      const resultObj = {
        matrix: originalMatrix,
        durations: [[0, 100], [100, 0]],
        distances: [[0, 1000], [1000, 0]],
        criterion: 'duration' as const,
        profile: 'driving' as const,
        isApproximate: false,
      };

      cache.set('test_key', resultObj);

      // Modyfikacja obiektu źródłowego po wywołaniu set() NIE może zmienić danych w cache
      originalMatrix[0][1] = 999999;
      const fetched1 = cache.get('test_key');
      expect(fetched1).toBeDefined();
      expect(fetched1!.matrix[0][1]).toBe(100);

      // Modyfikacja obiektu zwróconego przez get() NIE może zatruć kolejnych odczytów z cache
      fetched1!.matrix[0][1] = 777777;
      const fetched2 = cache.get('test_key');
      expect(fetched2).toBeDefined();
      expect(fetched2!.matrix[0][1]).toBe(100);
    });

    // 4. Cache OSRM: walidacja danych przed zapisem
    test('OsrmMatrixCache.set rzuca błąd przy próbie zapisu nieprawidłowej macierzy', () => {
      const cache = new OsrmMatrixCache();
      const corruptedResult = {
        matrix: [[0, NaN], [10, 0]], // Zawiera NaN
        criterion: 'duration' as const,
        profile: 'driving' as const,
        isApproximate: false,
      };

      expect(() => cache.set('corrupt', corruptedResult)).toThrow(/Niepoprawna macierz|NaN/i);
      expect(cache.get('corrupt')).toBeUndefined();
    });

    // 5. Cache OSRM: unikalność parametrów klucza (kolejność punktów, profil, kryterium)
    test('OsrmMatrixCache.generateKey rozróżnia kolejność punktów, profil, kryterium i bazowy URL', () => {
      const cache = new OsrmMatrixCache();
      const p1: GeoPoint = { id: '1', title: 'P1', lat: 41.8900000, lon: 12.4900000 };
      const p2: GeoPoint = { id: '2', title: 'P2', lat: 41.9000000, lon: 12.5000000 };

      const keyForward = cache.generateKey([p1, p2], 'driving', 'duration', 'https://osrm.org');
      const keyBackward = cache.generateKey([p2, p1], 'driving', 'duration', 'https://osrm.org');
      const keyWalking = cache.generateKey([p1, p2], 'walking', 'duration', 'https://osrm.org');
      const keyDistance = cache.generateKey([p1, p2], 'driving', 'distance', 'https://osrm.org');

      expect(keyForward).not.toBe(keyBackward);
      expect(keyForward).not.toBe(keyWalking);
      expect(keyForward).not.toBe(keyDistance);
    });

    // 6. Optymalizacja z hotelem (optimizeDayRouteWithHotel): dzień z hotelem i 3 atrakcjami
    test('optimizeDayRouteWithHotel poprawnie optymalizuje cykl zamknięty Hotel -> Atrakcje -> Hotel', () => {
      const hotel: GeoPoint = { id: 'hotel', title: 'Hotel Roma', lat: 41.8900, lon: 12.4900 };
      const a1: GeoPoint = { id: 'a1', title: 'Atrakcja 1', lat: 41.8950, lon: 12.4950 };
      const a2: GeoPoint = { id: 'a2', title: 'Atrakcja 2', lat: 41.9100, lon: 12.5100 };
      const a3: GeoPoint = { id: 'a3', title: 'Atrakcja 3', lat: 41.9000, lon: 12.5000 };

      // 0: Hotel, 1: A1, 2: A2, 3: A3
      // A1 i A3 są blisko hotelu, A2 jest najdalej
      const matrix = [
        [0, 10, 100, 20],  // Hotel -> [A1=10, A2=100, A3=20]
        [10, 0, 80, 15],   // A1 -> [Hotel=10, A2=80, A3=15]
        [100, 80, 0, 70],  // A2 -> [Hotel=100, A1=80, A3=70]
        [20, 15, 70, 0],   // A3 -> [Hotel=20, A1=15, A2=70]
      ];

      const res = optimizeDayRouteWithHotel(hotel, [a1, a2, a3], {
        matrix,
        criterion: 'duration',
        isApproximate: false,
      });

      expect(res.hasHotel).toBe(true);
      expect(res.fullTour.length).toBe(5); // Hotel, Atrakcja, Atrakcja, Atrakcja, Hotel
      expect(res.fullTour[0].id).toBe('hotel');
      expect(res.fullTour[4].id).toBe('hotel');
      expect(res.orderedAttractions.length).toBe(3);
      expect(res.totalCost).toBe(res.outboundCost + res.attractionsCost + res.returnCost);
      expect(res.totalCost).toBeGreaterThan(0);
    });

    // 7. Optymalizacja z hotelem: dzień z hotelem i 1 atrakcją
    test('optimizeDayRouteWithHotel dla 1 atrakcji z hotelem uwzględnia wyjazd i powrót do hotelu', () => {
      const hotel: GeoPoint = { id: 'hotel', title: 'Hotel', lat: 41.89, lon: 12.49 };
      const a1: GeoPoint = { id: 'a1', title: 'A1', lat: 41.90, lon: 12.50 };

      const matrix = [
        [0, 30],
        [40, 0], // Asymetria: Hotel->A1 = 30, A1->Hotel = 40
      ];

      const res = optimizeDayRouteWithHotel(hotel, [a1], {
        matrix,
        criterion: 'duration',
        isApproximate: false,
      });

      expect(res.hasHotel).toBe(true);
      expect(res.outboundCost).toBe(30);
      expect(res.returnCost).toBe(40);
      expect(res.attractionsCost).toBe(0);
      expect(res.totalCost).toBe(70);
      expect(res.fullTour.map((p) => p.id)).toEqual(['hotel', 'a1', 'hotel']);
    });

    // 8. Optymalizacja z hotelem: pusty dzień (0 atrakcji)
    test('optimizeDayRouteWithHotel dla pustego dnia zwraca zerowy koszt i puste atrakcje', () => {
      const hotel: GeoPoint = { id: 'hotel', title: 'Hotel', lat: 41.89, lon: 12.49 };

      const res = optimizeDayRouteWithHotel(hotel, []);
      expect(res.orderedAttractions).toEqual([]);
      expect(res.totalCost).toBe(0);
      expect(res.outboundCost).toBe(0);
      expect(res.returnCost).toBe(0);
    });

    // 9. Optymalizacja z hotelem: dzień bez hotelu (hotel = null)
    test('optimizeDayRouteWithHotel bez hotelu optymalizuje otwartą ścieżkę Hamiltona (brak kosztu powrotu)', () => {
      const a1: GeoPoint = { id: 'a1', title: 'A1', lat: 41.89, lon: 12.49 };
      const a2: GeoPoint = { id: 'a2', title: 'A2', lat: 41.90, lon: 12.50 };
      const a3: GeoPoint = { id: 'a3', title: 'A3', lat: 41.91, lon: 12.51 };

      const matrix = [
        [0, 20, 50],
        [20, 0, 15],
        [50, 15, 0],
      ];

      const res = optimizeDayRouteWithHotel(null, [a1, a2, a3], {
        matrix,
        criterion: 'duration',
        isApproximate: false,
      });

      expect(res.hasHotel).toBe(false);
      expect(res.outboundCost).toBe(0);
      expect(res.returnCost).toBe(0);
      expect(res.totalCost).toBe(35); // 0->1 (20) + 1->2 (15) = 35
      expect(res.orderedAttractions.length).toBe(3);
    });

    // 10. Optymalizacja z hotelem: dzień bez hotelu i 1 atrakcją
    test('optimizeDayRouteWithHotel bez hotelu i z 1 atrakcją zwraca koszt 0', () => {
      const a1: GeoPoint = { id: 'a1', title: 'A1', lat: 41.89, lon: 12.49 };

      const res = optimizeDayRouteWithHotel(null, [a1]);
      expect(res.hasHotel).toBe(false);
      expect(res.totalCost).toBe(0);
      expect(res.orderedAttractions).toEqual([a1]);
    });
  });

  describe('13. Ukierunkowany audyt: jednostki w hotel depot, walidacja macierzy, Relocate i cache OSRM', () => {
    const hotel: GeoPoint = { id: 'h1', title: 'Hotel', lat: 41.8900, lon: 12.4900 };
    const a1: GeoPoint = { id: 'a1', title: 'A1', lat: 41.8950, lon: 12.4950 };
    const a2: GeoPoint = { id: 'a2', title: 'A2', lat: 41.9000, lon: 12.5000 };

    // --- 1. JEDNOSTKI KOSZTÓW W optimizeDayRouteWithHotel ---
    test('brak macierzy drogowej ZAWSZE przypisuje jednostkę "km" i tryb przybliżony, nigdy sekundy ("s")', () => {
      // Przypadek A: wywołanie z żądaniem criterion === 'duration', ale BEZ macierzy OSRM
      const resNoMatrixDuration = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        criterion: 'duration',
      });
      // Zgodnie z zasadą: brak macierzy OSRM wymusza fallback na kilometry Haversine
      expect(resNoMatrixDuration.costUnit).toBe('km');
      expect(resNoMatrixDuration.isApproximate).toBe(true);
      expect(resNoMatrixDuration.effectiveCriterion).toBe('distance');
      expect(resNoMatrixDuration.totalCost).toBeGreaterThan(0);

      // Przypadek B: wywołanie z criterion === 'distance' BEZ macierzy OSRM
      const resNoMatrixDistance = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        criterion: 'distance',
      });
      expect(resNoMatrixDistance.costUnit).toBe('km');
      expect(resNoMatrixDistance.isApproximate).toBe(true);
      expect(resNoMatrixDistance.effectiveCriterion).toBe('distance');

      // Przypadek C: przekazanie macierzy z jawnym oznaczeniem isApproximate === true
      const approxMatrix = [
        [0, 1.2, 2.5],
        [1.2, 0, 1.1],
        [2.5, 1.1, 0],
      ];
      const resApproxWithMatrix = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        matrix: approxMatrix,
        criterion: 'duration',
        isApproximate: true,
      });
      expect(resApproxWithMatrix.costUnit).toBe('km');
      expect(resApproxWithMatrix.isApproximate).toBe(true);
      expect(resApproxWithMatrix.effectiveCriterion).toBe('distance');

      // Przypadek D: rzeczywista macierz drogowa OSRM duration -> 's' (sekundy)
      const roadTimeMatrix = [
        [0, 300, 600],
        [300, 0, 250],
        [600, 250, 0],
      ];
      const resOsrmDuration = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        matrix: roadTimeMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
      expect(resOsrmDuration.costUnit).toBe('s');
      expect(resOsrmDuration.isApproximate).toBe(false);
      expect(resOsrmDuration.effectiveCriterion).toBe('duration');

      // Przypadek E: rzeczywista macierz drogowa OSRM distance -> 'm' (metry)
      const roadDistMatrix = [
        [0, 1500, 3200],
        [1500, 0, 1100],
        [3200, 1100, 0],
      ];
      const resOsrmDistance = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        matrix: roadDistMatrix,
        criterion: 'distance',
        isApproximate: false,
      });
      expect(resOsrmDistance.costUnit).toBe('m');
      expect(resOsrmDistance.isApproximate).toBe(false);
      expect(resOsrmDistance.effectiveCriterion).toBe('distance');
    });

    // --- 2. WALIDACJA MACIERZY PRZED OPTYMALIZACJĄ ---
    test('validateCostMatrix oraz optimizeDayRouteWithHotel odrzucają nieprawidłowe macierze', () => {
      // A. Brakujące wiersze (mniej niż expectedN)
      const missingRows = [
        [0, 10, 20],
        [10, 0, 15],
      ];
      expect(validateCostMatrix(missingRows, 3).valid).toBe(false);
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: missingRows })).toThrow(
        /Nieprawidłowa liczba wierszy/i
      );

      // B. Wiersz o złej długości kolumn
      const badCols = [
        [0, 10, 20],
        [10, 0], // tylko 2 elementy
        [20, 15, 0],
      ];
      expect(validateCostMatrix(badCols, 3).valid).toBe(false);
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: badCols })).toThrow(
        /nieprawidłową liczbę kolumn/i
      );

      // C. Wartość NaN
      const nanMatrix = [
        [0, NaN, 20],
        [10, 0, 15],
        [20, 15, 0],
      ];
      expect(validateCostMatrix(nanMatrix, 3).valid).toBe(false);
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: nanMatrix })).toThrow(
        /prawidłową liczbą skończoną/i
      );

      // D. Wartość ujemna
      const negativeMatrix = [
        [0, -5, 20],
        [10, 0, 15],
        [20, 15, 0],
      ];
      expect(validateCostMatrix(negativeMatrix, 3).valid).toBe(false);
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: negativeMatrix })).toThrow(
        /jest ujemna/i
      );

      // E. Niezerowa przekątna (koszt punktu do samego siebie > 0)
      const nonZeroDiag = [
        [10, 10, 20],
        [10, 0, 15],
        [20, 15, 0],
      ];
      expect(validateCostMatrix(nonZeroDiag, 3).valid).toBe(false);
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: nonZeroDiag })).toThrow(
        /przekątnej macierzy.*musi wynosić 0/i
      );

      // F. Niezgodny rozmiar: z hotelem i 2 atrakcjami oczekiwana macierz to 3x3, podano 2x2
      const matrix2x2 = [
        [0, 10],
        [10, 0],
      ];
      expect(() => optimizeDayRouteWithHotel(hotel, [a1, a2], { matrix: matrix2x2 })).toThrow(
        /3x3 dla 2 atrakcji \+ hotel/i
      );

      // G. Niezgodny rozmiar: bez hotelu i 2 atrakcjami oczekiwana macierz to 2x2, podano 3x3
      const matrix3x3 = [
        [0, 10, 20],
        [10, 0, 15],
        [20, 15, 0],
      ];
      expect(() => optimizeDayRouteWithHotel(null, [a1, a2], { matrix: matrix3x3 })).toThrow(
        /2x2 dla 2 atrakcji bez hotelu/i
      );
    });

    // --- 3. applyRelocateMove - FORMALNA WERYFIKACJA Z MODELEM REFERENCYJNYM ---
    test('applyRelocateMove pokrywa wszystkie pary fromIndex i targetIndex zgodnie z modelem referencyjnym', () => {
      // Niezależny, aksjomatyczny model referencyjny:
      const referenceRelocate = (arr: number[], from: number, to: number): number[] => {
        const item = arr[from];
        const without = arr.filter((_, idx) => idx !== from);
        return [...without.slice(0, to), item, ...without.slice(to)];
      };

      const route = [10, 20, 30, 40, 50];
      const N = route.length;

      // Badamy wszystkie N x N = 25 możliwych par przesunięć
      for (let from = 0; from < N; from++) {
        for (let to = 0; to < N; to++) {
          const result = applyRelocateMove(route, from, to);
          const expected = referenceRelocate(route, from, to);

          // 1. Zgodność z modelem referencyjnym
          expect(result).toEqual(expected);

          // 2. Element przenoszony znajduje się DOKŁADNIE na indeksie docelowym w tablicy wynikowej
          expect(result[to]).toBe(route[from]);

          // 3. Niezmiennik długości i permutacji
          expect(result.length).toBe(N);
          expect(isPermutation(result.map((v) => v / 10 - 1), N)).toBe(true);

          // 4. Ruch tożsamościowy nie zmienia kolejności
          if (from === to) {
            expect(result).toEqual(route);
          }
        }
      }

      // Sprawdzenie rzucania błędu przy indeksach spoza dozwolonego zakresu
      expect(() => applyRelocateMove(route, -1, 2)).toThrow(/Nieprawidłowe indeksy/i);
      expect(() => applyRelocateMove(route, 2, 5)).toThrow(/Nieprawidłowe indeksy/i);
      expect(() => applyRelocateMove(route, 5, 2)).toThrow(/Nieprawidłowe indeksy/i);
    });

    // --- 4. CACHE OSRM: ZACHOWANIE NULL DLA TRAS NIEOSIĄGALNYCH I KOPIOWANIE ---
    test('OsrmMatrixCache zachowuje wartości null w durations i distances oraz kopiuje wszystkie pola', () => {
      const cache = new OsrmMatrixCache(10, 60000);

      // Format OSRM Table API zawierający null dla trasy nieprzejezdnej
      const osrmResultWithNulls = {
        matrix: [
          [0, 100],
          [100, 0],
        ],
        durations: [
          [0, null],   // Para 0 -> 1 jest nieosiągalna
          [150, 0],
        ],
        distances: [
          [0, null],
          [2000, 0],
        ],
        criterion: 'duration' as const,
        profile: 'driving' as const,
        isApproximate: false,
      };

      // 1. Walidacja cache akceptuje format OSRM z null (nie rzuca błędu)
      expect(validateOsrmCacheMatrix(osrmResultWithNulls.durations, 2).valid).toBe(true);
      expect(validateOsrmCacheMatrix(osrmResultWithNulls.distances, 2).valid).toBe(true);
      expect(() => cache.set('null_test_key', osrmResultWithNulls)).not.toThrow();

      // 2. Odczyt z cache zwraca zachowane wartości null (nie przekształca ich w tablice ani 0)
      const cached = cache.get('null_test_key');
      expect(cached).toBeDefined();
      expect(cached!.durations).toBeDefined();
      expect(cached!.durations![0][1]).toBeNull();
      expect(cached!.durations![1][0]).toBe(150);
      expect(cached!.distances).toBeDefined();
      expect(cached!.distances![0][1]).toBeNull();
      expect(cached!.distances![1][0]).toBe(2000);
      expect(cached!.criterion).toBe('duration');
      expect(cached!.profile).toBe('driving');
      expect(cached!.isApproximate).toBe(false);

      // 3. Walidacja cache odrzuca uszkodzone dane (NaN, ujemne, zły rozmiar)
      expect(validateOsrmCacheMatrix([[0, NaN], [0, 0]], 2).valid).toBe(false);
      expect(validateOsrmCacheMatrix([[0, -10], [0, 0]], 2).valid).toBe(false);
      expect(validateOsrmCacheMatrix([[0, 10]], 2).valid).toBe(false);
      expect(validateOsrmCacheMatrix([[5, 10], [10, 0]], 2).valid).toBe(false); // niezerowa przekątna
    });
  });

  describe('14. Ostateczny audyt krytyczny: spójność jednostek, matrixPointIds, solveRelocateTSP i cache', () => {
    const hotel: GeoPoint = { id: 'h1', title: 'Hotel Roma', lat: 41.8900, lon: 12.4900 };
    const a1: GeoPoint = { id: 'a1', title: 'Koloseum', lat: 41.8902, lon: 12.4922 };
    const a2: GeoPoint = { id: 'a2', title: 'Panteon', lat: 41.8986, lon: 12.4769 };
    const a3: GeoPoint = { id: 'a3', title: 'Fontanna di Trevi', lat: 41.9009, lon: 12.4833 };

    // --- 1. BEZWZGLĘDNA SPÓJNOŚĆ TRYBU PRZYBLIŻONEGO I JEDNOSTEK ---
    test('optimizeDayRouteWithHotel: brak macierzy wymusza tryb przybliżony, distance i km na wszystkich ścieżkach', () => {
      // Ścieżka 1: 0 atrakcji bez hotelu i z hotelem
      const emptyWithoutHotel = optimizeDayRouteWithHotel(null, [], { isApproximate: false, criterion: 'duration' });
      expect(emptyWithoutHotel.isApproximate).toBe(true);
      expect(emptyWithoutHotel.effectiveCriterion).toBe('distance');
      expect(emptyWithoutHotel.costUnit).toBe('km');
      expect(emptyWithoutHotel.totalCost).toBe(0);

      const emptyWithHotel = optimizeDayRouteWithHotel(hotel, [], { isApproximate: false, criterion: 'duration' });
      expect(emptyWithHotel.isApproximate).toBe(true);
      expect(emptyWithHotel.effectiveCriterion).toBe('distance');
      expect(emptyWithHotel.costUnit).toBe('km');
      expect(emptyWithHotel.totalCost).toBe(0);

      // Ścieżka 2: 1 atrakcja bez hotelu i z hotelem
      const singleWithoutHotel = optimizeDayRouteWithHotel(null, [a1], { isApproximate: false, criterion: 'duration' });
      expect(singleWithoutHotel.isApproximate).toBe(true);
      expect(singleWithoutHotel.effectiveCriterion).toBe('distance');
      expect(singleWithoutHotel.costUnit).toBe('km');
      expect(singleWithoutHotel.totalCost).toBe(0);

      const singleWithHotel = optimizeDayRouteWithHotel(hotel, [a1], { isApproximate: false, criterion: 'duration' });
      expect(singleWithHotel.isApproximate).toBe(true);
      expect(singleWithHotel.effectiveCriterion).toBe('distance');
      expect(singleWithHotel.costUnit).toBe('km');
      const expectedDistHToA1 = haversineDistance(hotel.lat, hotel.lon, a1.lat, a1.lon);
      const expectedDistA1ToH = haversineDistance(a1.lat, a1.lon, hotel.lat, hotel.lon);
      expect(singleWithHotel.outboundCost).toBeCloseTo(expectedDistHToA1, 2);
      expect(singleWithHotel.returnCost).toBeCloseTo(expectedDistA1ToH, 2);
      expect(singleWithHotel.totalCost).toBeCloseTo(expectedDistHToA1 + expectedDistA1ToH, 2);

      // Ścieżka 3: wiele atrakcji bez hotelu
      const multiWithoutHotel = optimizeDayRouteWithHotel(null, [a1, a2, a3], { isApproximate: false, criterion: 'duration' });
      expect(multiWithoutHotel.isApproximate).toBe(true);
      expect(multiWithoutHotel.effectiveCriterion).toBe('distance');
      expect(multiWithoutHotel.costUnit).toBe('km');
      expect(multiWithoutHotel.totalCost).toBeGreaterThan(0);

      // Ścieżka 4: wiele atrakcji z hotelem (Fixed Depot Closed TSP)
      const multiWithHotel = optimizeDayRouteWithHotel(hotel, [a1, a2, a3], { isApproximate: false, criterion: 'duration' });
      expect(multiWithHotel.isApproximate).toBe(true);
      expect(multiWithHotel.effectiveCriterion).toBe('distance');
      expect(multiWithHotel.costUnit).toBe('km');
      // Koszt musi odpowiadać sumie rzeczywistych odległości Haversine w km
      const p = multiWithHotel.orderedAttractions;
      const calcTotal =
        haversineDistance(hotel.lat, hotel.lon, p[0].lat, p[0].lon) +
        haversineDistance(p[0].lat, p[0].lon, p[1].lat, p[1].lon) +
        haversineDistance(p[1].lat, p[1].lon, p[2].lat, p[2].lon) +
        haversineDistance(p[2].lat, p[2].lon, hotel.lat, hotel.lon);
      expect(multiWithHotel.totalCost).toBeCloseTo(calcTotal, 2);
    });

    test('optimizeDayRouteWithHotel: odrzuca sprzeczną konfigurację jednostek drogowych w trybie przybliżonym', () => {
      const validRoadMatrix = [
        [0, 300, 500],
        [300, 0, 200],
        [500, 200, 0],
      ];

      // Próba przekazania sekund 's' z isApproximate: true
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: validRoadMatrix,
          matrixCostUnit: 's',
          isApproximate: true,
        });
      }).toThrow(/Sprzeczna konfiguracja.*jednostkach "s"/i);

      // Próba przekazania metrów 'm' z isApproximate: true
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: validRoadMatrix,
          matrixCostUnit: 'm',
          isApproximate: true,
        });
      }).toThrow(/Sprzeczna konfiguracja.*jednostkach "m"/i);
    });

    // --- 2. WALIDACJA matrixPointIds ORAZ WARTOŚCI NULL Z OSRM ---
    test('optimizeDayRouteWithHotel: weryfikuje zgodność matrixPointIds z kolejnością punktów', () => {
      const matrix3x3 = [
        [0, 100, 200],
        [100, 0, 150],
        [200, 150, 0],
      ];

      // Poprawne ID: [hotel.id, a1.id, a2.id]
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrix3x3,
          matrixPointIds: ['h1', 'a1', 'a2'],
        });
      }).not.toThrow();

      // Zła kolejność punktów
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrix3x3,
          matrixPointIds: ['h1', 'a2', 'a1'],
        });
      }).toThrow(/Niezgodność identyfikatorów lub kolejności punktów/i);

      // Błędny identyfikator hotelu
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrix3x3,
          matrixPointIds: ['wrong_hotel', 'a1', 'a2'],
        });
      }).toThrow(/Niezgodność identyfikatorów lub kolejności punktów/i);

      // Niewłaściwa liczba punktów w matrixPointIds
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrix3x3,
          matrixPointIds: ['h1', 'a1'],
        });
      }).toThrow(/Niezgodność identyfikatorów lub kolejności punktów/i);
    });

    test('validateCostMatrix i optimizeDayRouteWithHotel odrzucają macierze z wartością null (odcinek nieosiągalny OSRM)', () => {
      const matrixWithNull = [
        [0, null as any, 200],
        [100, 0, 150],
        [200, 150, 0],
      ];

      const val = validateCostMatrix(matrixWithNull, 3);
      expect(val.valid).toBe(false);
      expect(val.error).toMatch(/wynosi null \(odcinek nieosiągalny OSRM\)/i);

      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrixWithNull,
        });
      }).toThrow(/wynosi null \(odcinek nieosiągalny OSRM\)/i);
    });

    // --- 3. solveRelocateTSP: PRZESZUKIWANIE SĄSIEDZTWA, FIXSTART I NIEZMIENNIKI ---
    test('solveRelocateTSP: przestrzega fixStartPoint, niezmiennika permutacji i optymalizuje asymetryczną trasę', () => {
      // Asymetryczna macierz kosztów (ATSP):
      // W trasie [0, 1, 2, 3] koszt: (0->1: 10) + (1->2: 200) + (2->3: 10) = 220
      // Jeśli przesuniemy wierzchołek 2 przed 1 (ruch relocate 2 -> 1):
      // Nowa trasa [0, 2, 1, 3] koszt: (0->2: 5) + (2->1: 5) + (1->3: 5) = 15!
      const asymMatrix = [
        [0, 10, 5, 100],
        [100, 0, 200, 5],
        [100, 5, 0, 100],
        [100, 100, 100, 0],
      ];

      const initialRoute = [0, 1, 2, 3];
      const initialCost = calculatePathDistance(initialRoute, asymMatrix);

      // Uruchomienie solveRelocateTSP z fixStart = true
      const resFixed = solveRelocateTSP(initialRoute, asymMatrix, true);
      expect(resFixed.route[0]).toBe(0); // Punkt startowy nienaruszony!
      expect(isPermutation(resFixed.route, 4)).toBe(true);
      expect(resFixed.distance).toBeLessThan(initialCost);
      expect(resFixed.route).toEqual([0, 2, 1, 3]);

      // Sprawdzenie, że gdy fixStart = false, punkt startowy może zostać zmieniony, jeśli to tańsze
      const resFree = solveRelocateTSP(initialRoute, asymMatrix, false);
      expect(isPermutation(resFree.route, 4)).toBe(true);
      expect(resFree.distance).toBeLessThanOrEqual(resFixed.distance);
    });

    test('solveRelocateTSP: przeszukuje dokładnie wszystkie (N-1)(N-2) dopuszczalnych ruchów nietożsamościowych dla fixStart', () => {
      const N = 5;
      const initialRoute = [0, 1, 2, 3, 4];
      const testedMoves: Array<{ from: number; to: number }> = [];

      // Weryfikacja przestrzeni ruchów: dla fixStart startIndex = 1
      for (let i = 1; i < N; i++) {
        for (let target = 1; target < N; target++) {
          if (target === i) continue;
          testedMoves.push({ from: i, to: target });

          const candidate = applyRelocateMove(initialRoute, i, target);
          // 1. Punkt startowy ZAWSZE na pozycji 0
          expect(candidate[0]).toBe(0);
          // 2. Ścisła permutacja wierzchołków
          expect(isPermutation(candidate, N)).toBe(true);
          // 3. Ruch jest nietożsamościowy
          expect(candidate).not.toEqual(initialRoute);
          // 4. Element z indeksu i wylądował na indeksie target
          expect(candidate[target]).toBe(initialRoute[i]);
        }
      }

      // Liczba ruchów dla N=5 przy fixStart: (5-1) * (5-2) = 4 * 3 = 12 ruchów
      expect(testedMoves.length).toBe(12);
    });

    // --- 4. CACHE OSRM: GŁĘBOKIE KOPIOWANIE I PEŁNA IZOLACJA MUTACJI ---
    test('OsrmMatrixCache zapewnia 100% odporność na modyfikacje z zewnątrz (głębokie klonowanie)', () => {
      const cache = new OsrmMatrixCache(5, 60000);
      const originalInput = {
        matrix: [
          [0, 10],
          [20, 0],
        ],
        durations: [
          [0, 100],
          [200, 0],
        ],
        distances: [
          [0, 1000],
          [2000, 0],
        ],
        criterion: 'duration' as const,
        profile: 'driving' as const,
        isApproximate: false,
      };

      cache.set('key_isolation', originalInput);

      // 1. Zewnętrzna mutacja obiektu WEJŚCIOWEGO po zapisie nie modyfikuje cache
      originalInput.matrix[0][1] = 999;
      originalInput.durations[0][1] = 8888;
      originalInput.distances[0][1] = 77777;

      const read1 = cache.get('key_isolation');
      expect(read1!.matrix[0][1]).toBe(10);
      expect(read1!.durations![0][1]).toBe(100);
      expect(read1!.distances![0][1]).toBe(1000);

      // 2. Modyfikacja obiektu ZWRÓCONEGO przez get() nie modyfikuje kolejnych odczytów z cache
      read1!.matrix[0][1] = 555;
      read1!.durations![0][1] = 4444;
      read1!.distances![0][1] = 33333;

      const read2 = cache.get('key_isolation');
      expect(read2!.matrix[0][1]).toBe(10);
      expect(read2!.durations![0][1]).toBe(100);
      expect(read2!.distances![0][1]).toBe(1000);
    });

    test('validateOsrmCacheMatrix: odrzuca null na przekątnej, ale akceptuje poza przekątną', () => {
      // Null na przekątnej [0][0] musi być odrzucony (przekątna musi wynosić 0)
      const nullOnDiagonal = [
        [null, 100],
        [100, 0],
      ];
      expect(validateOsrmCacheMatrix(nullOnDiagonal, 2).valid).toBe(false);

      // Null poza przekątną (unreachable route) jest dozwolony w formacie OSRM dla cache
      const nullOffDiagonal = [
        [0, null],
        [100, 0],
      ];
      expect(validateOsrmCacheMatrix(nullOffDiagonal, 2).valid).toBe(true);
    });

    // --- 5. WIĄZANIE ŹRÓDŁA MACIERZY (MatrixSourceType) I WERYFIKACJA RZĘDU WIELKOŚCI ---
    test('optimizeDayRouteWithHotel: weryfikuje deklarowane źródło macierzy (MatrixSourceType) i odrzuca sprzeczności', () => {
      const roadMatrix = [
        [0, 300, 600],
        [300, 0, 250],
        [600, 250, 0],
      ];

      // Źródło osrm-table nie może być w km
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: roadMatrix,
          matrixSource: 'osrm-table',
          matrixCostUnit: 'km',
        });
      }).toThrow(/Źródło "osrm-table" nie dostarcza macierzy w kilometrach/i);

      // Źródło osrm-table nie może być trybem przybliżonym
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: roadMatrix,
          matrixSource: 'osrm-table',
          isApproximate: true,
        });
      }).toThrow(/Źródło "osrm-table" nie może być użyte w trybie przybliżonym/i);

      // Źródło haversine-calculated wymaga jednostki km
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: roadMatrix,
          matrixSource: 'haversine-calculated',
          matrixCostUnit: 's',
        });
      }).toThrow(/Źródło "haversine-calculated" wymaga jednostki "km"/i);

      // Poprawne wywołanie z matrixSource: 'osrm-table'
      const validOsrm = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        matrix: roadMatrix,
        matrixSource: 'osrm-table',
        matrixCostUnit: 's',
      });
      expect(validOsrm.routeStatus).toBe('road_confirmed');
      expect(validOsrm.costUnit).toBe('s');
      expect(validOsrm.isApproximate).toBe(false);
    });

    test('optimizeDayRouteWithHotel: heurytyka rzędu wielkości wykrywa omyłkowe oznaczenie sekund jako km lub odwrotnie', () => {
      // Punkty w Rzymie: odległości geograficzne rzędu 1-4 km
      const matrixWithSecondsPassedAsKm = [
        [0, 1500, 2400],
        [1500, 0, 900],
        [2400, 900, 0],
      ];

      // Wykrywa błąd: zadeklarowano "km", ale wartości wynoszą 2400 km dla punktów oddalonych o ~3 km!
      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: matrixWithSecondsPassedAsKm,
          matrixCostUnit: 'km',
        });
      }).toThrow(/Wykryto rozbieżność rzędu wielkości kosztów.*Zadeklarowano jednostkę "km"/i);

      // Wykrywa błąd: zadeklarowano "s", ale wartości to ułamki (np. 0.05 sekundy dla punktów oddalonych o kilometry)
      const tinyMatrixPassedAsSeconds = [
        [0, 0.05, 0.08],
        [0.05, 0, 0.03],
        [0.08, 0.03, 0],
      ];

      expect(() => {
        optimizeDayRouteWithHotel(hotel, [a1, a2], {
          matrix: tinyMatrixPassedAsSeconds,
          matrixCostUnit: 's',
        });
      }).toThrow(/Wykryto rozbieżność rzędu wielkości kosztów.*Zadeklarowano czas w sekundach/i);
    });

    test('optimizeDayRouteWithHotel oraz optimizeSightseeingRoute jednoznacznie ustawiają routeStatus', () => {
      // 1. Bez macierzy OSRM: status to zawsze straight_line_estimate
      const noMatrix = optimizeDayRouteWithHotel(hotel, [a1, a2]);
      expect(noMatrix.routeStatus).toBe('straight_line_estimate');
      expect(noMatrix.isApproximate).toBe(true);

      // 2. Z poprawną macierzą OSRM: status to road_confirmed
      const roadMatrix = [
        [0, 300, 500],
        [300, 0, 200],
        [500, 200, 0],
      ];
      const withMatrix = optimizeDayRouteWithHotel(hotel, [a1, a2], {
        matrix: roadMatrix,
        matrixCostUnit: 's',
      });
      expect(withMatrix.routeStatus).toBe('road_confirmed');
      expect(withMatrix.isApproximate).toBe(false);

      // 3. optimizeSightseeingRoute bez macierzy
      const sightNoMatrix = optimizeSightseeingRoute([a1, a2, a3]);
      expect(sightNoMatrix.routeStatus).toBe('straight_line_estimate');

      // 4. optimizeSightseeingRoute z macierzą OSRM
      const sightWithMatrix = optimizeSightseeingRoute([a1, a2, a3], false, {
        customMatrix: roadMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
      expect(sightWithMatrix.routeStatus).toBe('road_confirmed');
    });
  });
});
