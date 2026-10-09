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
});
