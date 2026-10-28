// __tests__/tests_RouteOptimization_17Scenarios.test.ts
import {
  haversineDistance,
  buildDistanceMatrix,
  calculatePathDistance,
  optimizeSightseeingRoute,
  optimizeSightseeingRouteWithRoadNetwork,
  fetchOsrmRoadMatrix,
  clearInFlightOsrmRequests,
  fetchRealRouteInfo,
  calculateTransitEstimates,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsFullRouteUrl,
  optimizeDayRouteWithHotel,
  getDeterministicCoordinateOffset,
  resolvePointCoordinates,
  resolvePointCoordinatesAsync,
  OsrmMatrixCache,
  OSRM_MATRIX_CACHE,
  type GeoPoint,
} from '../src/lib/routeOptimization';
import { getOsrmBaseUrl } from '../src/lib/config';

describe('DESTIVO: 17 Scenariuszy Weryfikacji Silnika Optymalizacji Tras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OSRM_MATRIX_CACHE.clear();
    clearInFlightOsrmRequests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    OSRM_MATRIX_CACHE.clear();
    clearInFlightOsrmRequests();
  });

  // =========================================================================
  // Scenariusz 1: Wiele atrakcji w różnych częściach miasta (6–8 punktów w Rzymie)
  // =========================================================================
  describe('Scenariusz 1: Wiele atrakcji w różnych częściach miasta (6-8 punktów w Rzymie)', () => {
    const romePoints: GeoPoint[] = [
      { id: 'colosseum', title: 'Koloseum', lat: 41.8902, lon: 12.4922 },
      { id: 'vatican', title: 'Watykan', lat: 41.9022, lon: 12.4539 },
      { id: 'spanish_steps', title: 'Schody Hiszpańskie', lat: 41.9060, lon: 12.4828 },
      { id: 'trastevere', title: 'Zatybrze (Trastevere)', lat: 41.8887, lon: 12.4697 },
      { id: 'villa_borghese', title: 'Villa Borghese', lat: 41.9135, lon: 12.4922 },
      { id: 'forum_romanum', title: 'Forum Romanum', lat: 41.8925, lon: 12.4853 },
      { id: 'catacombs', title: 'Katakumby św. Kaliksta', lat: 41.8595, lon: 12.5103 },
    ];

    test('optymalizacja 7 punktów w Rzymie redukuje dystans i zachowuje kompletny zbiór atrakcji', () => {
      // Przemieszana trasa z częstym zygzakowaniem po całym mieście
      const disordered = [
        romePoints[6], // Catacombs (południe)
        romePoints[1], // Watykan (zachód)
        romePoints[0], // Koloseum (centrum-wschód)
        romePoints[4], // Villa Borghese (północ)
        romePoints[3], // Trastevere (południowy zachód)
        romePoints[2], // Schody Hiszpańskie (północ-centrum)
        romePoints[5], // Forum Romanum (centrum)
      ];

      const res = optimizeSightseeingRoute(disordered, false);

      expect(res.orderedPoints).toHaveLength(7);
      expect(res.savingsPercent).toBeGreaterThan(15);
      expect(res.optimizedDistanceKm).toBeLessThan(res.originalDistanceKm);

      // Wszystkie ID muszą być zachowane (permutacja bez strat)
      const inputIds = disordered.map((p) => p.id).sort();
      const outputIds = res.orderedPoints.map((p) => p.id).sort();
      expect(outputIds).toEqual(inputIds);

      // Bliskie punkty powinny być zgrupowane (np. Forum Romanum i Koloseum są sąsiadami)
      const colosseumIdx = res.orderedPoints.findIndex((p) => p.id === 'colosseum');
      const forumIdx = res.orderedPoints.findIndex((p) => p.id === 'forum_romanum');
      expect(Math.abs(colosseumIdx - forumIdx)).toBeLessThanOrEqual(2);
    });
  });

  // =========================================================================
  // Scenariusz 2: Trasa ze stałym punktem startowym i powrotem do hotelu
  // =========================================================================
  describe('Scenariusz 2: Trasa ze stałym punktem startowym i powrotem do hotelu (zamknięta pętla hotelowa)', () => {
    const hotel: GeoPoint = { id: 'hotel', title: 'Hotel Quirinale', lat: 41.9015, lon: 12.4960 };
    const attractions: GeoPoint[] = [
      { id: 'pantheon', title: 'Panteon', lat: 41.8986, lon: 12.4769 },
      { id: 'trevi', title: 'Fontanna di Trevi', lat: 41.9009, lon: 12.4833 },
      { id: 'colosseum', title: 'Koloseum', lat: 41.8902, lon: 12.4922 },
    ];

    test('optimizeDayRouteWithHotel tworzy trasę rozpoczynającą się i kończącą w hotelu', () => {
      const res = optimizeDayRouteWithHotel(hotel, attractions);

      expect(res.fullTour[0].id).toBe('hotel');
      expect(res.fullTour[res.fullTour.length - 1].id).toBe('hotel');
      expect(res.fullTour).toHaveLength(5); // hotel -> 3 atrakcje -> hotel
      expect(res.orderedAttractions).toHaveLength(3);
      expect(res.totalCost).toBeGreaterThan(0);
      expect(res.costUnit).toBe('km');
      expect(res.isApproximate).toBe(true); // brak macierzy OSRM = jawny fallback
      expect(res.routeStatus).toBe('straight_line_estimate');
    });
  });

  // =========================================================================
  // Scenariusz 3: Trasa z punktem końcowym innym niż startowy (hotel -> lotnisko)
  // =========================================================================
  describe('Scenariusz 3: Trasa z punktem końcowym innym niż startowy (hotel -> atrakcje -> lotnisko/dworzec)', () => {
    const hotel: GeoPoint = { id: 'hotel', title: 'Hotel Termini', lat: 41.9015, lon: 12.5000 };
    const airport: GeoPoint = { id: 'airport', title: 'Lotnisko Fiumicino (FCO)', lat: 41.8003, lon: 12.2389 };
    const attractions: GeoPoint[] = [
      { id: 'colosseum', title: 'Koloseum', lat: 41.8902, lon: 12.4922 },
      { id: 'pantheon', title: 'Panteon', lat: 41.8986, lon: 12.4769 },
    ];

    test('trasa zaczyna się w hotelu i kończy na lotnisku z optymalizacją punktów pośrednich', () => {
      const allPoints = [hotel, ...attractions, airport];
      const res = optimizeSightseeingRoute(allPoints, true);

      expect(res.orderedPoints[0].id).toBe('hotel');
      expect(res.orderedPoints).toHaveLength(4);
      const visitedIds = res.orderedPoints.map((p) => p.id);
      expect(visitedIds).toContain('colosseum');
      expect(visitedIds).toContain('pantheon');
      expect(visitedIds).toContain('airport');
    });
  });

  // =========================================================================
  // Scenariusz 4: Punkty położone bardzo blisko siebie vs punkty odległe
  // =========================================================================
  describe('Scenariusz 4: Punkty bardzo blisko siebie vs odległe (zapobieganie skakaniu po mapie)', () => {
    test('bliskie punkty w centrum są zwiedzane łącznie przed wyjazdem na obrzeża', () => {
      const pCentrum1: GeoPoint = { id: 'navona', title: 'Piazza Navona', lat: 41.8992, lon: 12.4731 };
      const pCentrum2: GeoPoint = { id: 'pantheon', title: 'Panteon', lat: 41.8986, lon: 12.4769 };
      const pCentrum3: GeoPoint = { id: 'trevi', title: 'Trevi', lat: 41.9009, lon: 12.4833 };
      const pOdlegly: GeoPoint = { id: 'tivoli', title: 'Villa dEste w Tivoli', lat: 41.9634, lon: 12.7963 }; // ~25km dalej

      // Wejście przeplatane: centrum -> Tivoli -> centrum
      const input = [pCentrum1, pOdlegly, pCentrum2, pCentrum3];
      const res = optimizeSightseeingRoute(input, false);

      // Odległy punkt nie powinien być w środku pomiędzy dwoma bliskimi punktami centrum
      const tivoliIndex = res.orderedPoints.findIndex((p) => p.id === 'tivoli');
      expect(tivoliIndex === 0 || tivoliIndex === res.orderedPoints.length - 1).toBe(true);
      expect(res.savingsPercent).toBeGreaterThan(20);
    });
  });

  // =========================================================================
  // Scenariusz 5: Punkty z brakującymi lub nieprawidłowymi współrzędnymi i duplikaty
  // =========================================================================
  describe('Scenariusz 5: Punkty z brakującymi/nieprawidłowymi współrzędnymi oraz identycznymi współrzędnymi', () => {
    test('punkty o identycznych koordynatach otrzymują deterministyczny jitter i żaden punkt nie znika', () => {
      // Dwie różne sale tego samego muzeum (np. Muzeum Watykańskie: Kaplica Sykstyńska i Galeria Map)
      const room1: GeoPoint = { id: 'sistine', title: 'Kaplica Sykstyńska', lat: 41.9031, lon: 12.4545 };
      const room2: GeoPoint = { id: 'gallery_maps', title: 'Galeria Map', lat: 41.9031, lon: 12.4545 };
      const colosseum: GeoPoint = { id: 'colosseum', title: 'Koloseum', lat: 41.8902, lon: 12.4922 };

      const offset1 = getDeterministicCoordinateOffset('sistine');
      const offset2 = getDeterministicCoordinateOffset('gallery_maps');

      // Offsety nie mogą być identyczne
      expect(offset1.latOffset !== offset2.latOffset || offset1.lonOffset !== offset2.lonOffset).toBe(true);

      const res = optimizeSightseeingRoute([room1, room2, colosseum]);
      expect(res.orderedPoints).toHaveLength(3);
      const ids = res.orderedPoints.map((p) => p.id);
      expect(ids).toContain('sistine');
      expect(ids).toContain('gallery_maps');
      expect(ids).toContain('colosseum');
    });

    test('resolvePointCoordinates przywraca bezpieczną lokalizację dla brakujących współrzędnych', async () => {
      const coords = resolvePointCoordinates('Nieznane Miejsce XYZ', [], 'Rome', null, { lat: undefined, lon: undefined });
      expect(coords.lat).toBeDefined();
      expect(coords.lon).toBeDefined();
      expect(typeof coords.lat).toBe('number');
      expect(typeof coords.lon).toBe('number');

      const asyncCoords = await resolvePointCoordinatesAsync('Nieznane Miejsce XYZ', [], 'Rome', null, { lat: undefined, lon: undefined });
      expect(asyncCoords.isFallback).toBe(true);
    });
  });

  // =========================================================================
  // Scenariusz 6: Prawidłowa odpowiedź OSRM (status 200, pełna macierz)
  // =========================================================================
  describe('Scenariusz 6: Prawidłowa odpowiedź OSRM (status 200, pełna macierz)', () => {
    test('fetchOsrmRoadMatrix zwraca status road_confirmed i zapisuje macierz w cache', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'Punkt A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'Punkt B', lat: 41.90, lon: 12.50 };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'Ok',
          durations: [
            [0, 420],
            [430, 0],
          ],
          distances: [
            [0, 2400],
            [2450, 0],
          ],
        }),
      } as Response);

      const res = await fetchOsrmRoadMatrix([ptA, ptB], { criterion: 'duration', profile: 'driving' });

      expect(res.criterion).toBe('duration');
      expect(res.matrix).toEqual([
        [0, 420],
        [430, 0],
      ]);
      expect(res.isApproximate).toBe(false);

      // Sprawdzenie zapisu w cache
      const cached = OSRM_MATRIX_CACHE.has(
        OSRM_MATRIX_CACHE.generateKey([ptA, ptB], 'driving', 'duration', getOsrmBaseUrl())
      );
      expect(cached).toBe(true);
    });
  });

  // =========================================================================
  // Scenariusz 7: Timeout OSRM
  // =========================================================================
  describe('Scenariusz 7: Timeout OSRM (brak odpowiedzi w zadanym limicie czasu)', () => {
    test('fetchOsrmRoadMatrix odrzuca z komunikatem timeoutu przy AbortError', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      jest.spyOn(global, 'fetch').mockImplementation(() => {
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], { timeoutMs: 100, maxRetries: 0 })
      ).rejects.toThrow(/Przekroczono limit czasu/i);
    });
  });

  // =========================================================================
  // Scenariusz 8: Błędy HTTP OSRM, niepoprawny JSON i niekompletna macierz
  // =========================================================================
  describe('Scenariusz 8: Błąd HTTP OSRM (500, 502, 503), niepoprawny JSON, niekompletna macierz', () => {
    const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
    const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

    test('obsługuje błąd HTTP 503 Service Unavailable', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'OSRM Server overloaded',
      } as Response);

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], { maxRetries: 0 })
      ).rejects.toThrow(/503/);
    });

    test('obsługuje niepoprawny JSON (np. błąd HTML Cloudflare)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      } as unknown as Response);

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], { maxRetries: 0 })
      ).rejects.toThrow(/Błąd parsowania/i);
    });

    test('odrzuca macierz OSRM zawierającą wartości null lub błędne wymiary', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          code: 'Ok',
          durations: [
            [0, null],
            [300, 0],
          ],
        }),
      } as Response);

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], { maxRetries: 0 })
      ).rejects.toThrow(/Brak połączenia drogowego|OSRM_UNREACHABLE_POINTS/i);
    });
  });

  // =========================================================================
  // Scenariusz 9: Brak połączenia sieciowego (offline)
  // =========================================================================
  describe('Scenariusz 9: Brak połączenia sieciowego (offline)', () => {
    test('przy braku sieci zgłasza błąd sieciowy bez zawieszania aplikacji', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Network request failed'));

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], { maxRetries: 0 })
      ).rejects.toThrow(/Błąd połączenia z serwerem OSRM/i);
    });
  });

  // =========================================================================
  // Scenariusz 10: Chwilowa niedostępność serwera i udane ponowienie żądania (retry)
  // =========================================================================
  describe('Scenariusz 10: Chwilowa niedostępność serwera i udane ponowienie żądania (retry)', () => {
    test('pierwsze żądanie kończy się 502, drugie sukcesem 200', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => 'Gateway timeout',
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 180],
              [190, 0],
            ],
          }),
        } as Response);

      const res = await fetchOsrmRoadMatrix([ptA, ptB], { maxRetries: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.matrix[0][1]).toBe(180);
      expect(res.isApproximate).toBe(false);
    });
  });

  // =========================================================================
  // Scenariusz 11: Zmiana trasy / punktów w trakcie trwającego żądania OSRM (abort)
  // =========================================================================
  describe('Scenariusz 11: Zmiana trasy / punktów w trakcie żądania (anulowanie przez AbortController)', () => {
    test('zewnętrzny AbortSignal natychmiast przerywa oczekiwanie i nie wykonuje ponowień', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      const abortController = new AbortController();

      jest.spyOn(global, 'fetch').mockImplementation(() => {
        // Symulacja anulowania przez komponent React w trakcie lotu
        abortController.abort();
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      await expect(
        fetchOsrmRoadMatrix([ptA, ptB], {
          signal: abortController.signal,
          maxRetries: 2,
        })
      ).rejects.toThrow(/Żądanie OSRM zostało anulowane/i);
    });
  });

  // =========================================================================
  // Scenariusz 12: Dwa równoległe żądania optymalizacji dla różnych tras (brak wyścigu danych)
  // =========================================================================
  describe('Scenariusz 12: Dwa równoległe żądania optymalizacji dla różnych tras (brak wyścigu danych)', () => {
    test('żądania dla Rzymu i Paryża nie mieszają swoich macierzy ani kluczy cache', async () => {
      const romeA: GeoPoint = { id: 'r1', title: 'Koloseum', lat: 41.8902, lon: 12.4922 };
      const romeB: GeoPoint = { id: 'r2', title: 'Watykan', lat: 41.9022, lon: 12.4539 };

      const parisA: GeoPoint = { id: 'p1', title: 'Eiffel', lat: 48.8584, lon: 2.2945 };
      const parisB: GeoPoint = { id: 'p2', title: 'Louvre', lat: 48.8606, lon: 2.3376 };

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (typeof url === 'string' && url.includes('12.4922')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              code: 'Ok',
              durations: [
                [0, 500],
                [510, 0],
              ],
            }),
          } as Response;
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              code: 'Ok',
              durations: [
                [0, 800],
                [820, 0],
              ],
            }),
          } as Response;
        }
      });

      const [resRome, resParis] = await Promise.all([
        fetchOsrmRoadMatrix([romeA, romeB], { criterion: 'duration', profile: 'driving' }),
        fetchOsrmRoadMatrix([parisA, parisB], { criterion: 'duration', profile: 'driving' }),
      ]);

      expect(resRome.matrix[0][1]).toBe(500);
      expect(resParis.matrix[0][1]).toBe(800);

      // Klucze cache są ściśle odrębne
      const base = getOsrmBaseUrl();
      const keyRome = OSRM_MATRIX_CACHE.generateKey([romeA, romeB], 'driving', 'duration', base);
      const keyParis = OSRM_MATRIX_CACHE.generateKey([parisA, parisB], 'driving', 'duration', base);
      expect(keyRome).not.toEqual(keyParis);
      expect(OSRM_MATRIX_CACHE.get(keyRome)?.matrix[0][1]).toBe(500);
      expect(OSRM_MATRIX_CACHE.get(keyParis)?.matrix[0][1]).toBe(800);
    });
  });

  // =========================================================================
  // Scenariusz 13: Zakończenie stanu „Wczytywanie wskazówek dojazdu” w każdym przypadku
  // =========================================================================
  describe('Scenariusz 13: Zakończenie stanu Wczytywanie wskazówek dojazdu (sukces, błąd, timeout, anulowanie)', () => {
    test('fetchRealRouteInfo zawsze zwraca kompletny obiekt z czasami dojazdu i dystansem', async () => {
      const from = { lat: 41.8902, lon: 12.4922 };
      const to = { lat: 41.8986, lon: 12.4769 };

      const info = await fetchRealRouteInfo(from, to);
      expect(info.walkMinutes).toBeGreaterThan(0);
      expect(info.walkDistanceKm).toBeGreaterThan(0);
      expect(info.driveMinutes).toBeGreaterThan(0);
      expect(info.driveDistanceKm).toBeGreaterThan(0);
      expect(info.recommendedMode).toBeDefined();
    });
  });

  // =========================================================================
  // Scenariusz 14: Trasa fallbackowa nigdy nie jest oznaczona jako potwierdzona drogowa
  // =========================================================================
  describe('Scenariusz 14: Trasa fallbackowa nigdy nie jest oznaczona jako road_confirmed', () => {
    test('optimizeDayRouteWithHotel przy braku macierzy ustawia status straight_line_estimate', () => {
      const hotel: GeoPoint = { id: 'h', title: 'Hotel', lat: 41.89, lon: 12.49 };
      const pt: GeoPoint = { id: 'p', title: 'Koloseum', lat: 41.90, lon: 12.50 };

      const res = optimizeDayRouteWithHotel(hotel, [pt]);

      expect(res.routeStatus).not.toBe('road_confirmed');
      expect(res.routeStatus).toBe('straight_line_estimate');
      expect(res.isApproximate).toBe(true);
      expect(res.costUnit).toBe('km');
      expect(res.effectiveCriterion).toBe('distance');
    });

    test('optimizeSightseeingRoute przy braku macierzy OSRM raportuje isApproximate = true', () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      const res = optimizeSightseeingRoute([ptA, ptB], false);

      expect(res.isApproximate).toBe(true);
      expect(res.routeStatus).toBe('straight_line_estimate');
      expect(res.costUnit).toBe('km');
      expect(res.criterion).toBe('distance');
    });
  });

  // =========================================================================
  // Scenariusz 15: Spójność kolejności punktów między listą a trasą na mapie
  // =========================================================================
  describe('Scenariusz 15: Spójność kolejności punktów między listą a trasą na mapie', () => {
    test('kolejność wygenerowana w orderedPoints odpowiada dokładnie waypointom w URL Google Maps', () => {
      const points: GeoPoint[] = [
        { id: 'start', title: 'Koloseum', lat: 41.8902, lon: 12.4922 },
        { id: 'mid1', title: 'Panteon', lat: 41.8986, lon: 12.4769 },
        { id: 'mid2', title: 'Fontanna di Trevi', lat: 41.9009, lon: 12.4833 },
      ];

      const res = optimizeSightseeingRoute(points, true);

      const url = buildGoogleMapsFullRouteUrl(
        res.orderedPoints.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          title: p.title,
        })),
        'Rome'
      );

      const firstPoint = res.orderedPoints[0];
      const lastPoint = res.orderedPoints[res.orderedPoints.length - 1];

      // Origin w URL odpowiada dokładnie pierwszemu punktowi zoptymalizowanej listy
      expect(url).toContain('origin=');
      expect(url).toContain(encodeURIComponent(firstPoint.title));
      // Destination odpowiada dokładnie ostatniemu punktowi listy
      expect(url).toContain('destination=');
      expect(url).toContain(encodeURIComponent(lastPoint.title));
    });
  });

  // =========================================================================
  // Scenariusz 16: Brak rekomendacji komunikacji miejskiej bez danych rozkładowych
  // =========================================================================
  describe('Scenariusz 16: Brak fikcyjnej komunikacji miejskiej bez rzeczywistych danych rozkładowych', () => {
    test('calculateTransitEstimates dla długich tras sugeruje sprawdzenie rozkładu, nie fikcyjną linię', () => {
      const fromPt = { lat: 41.8902, lon: 12.4922 }; // Koloseum
      const farPt = { lat: 41.8595, lon: 12.5103 }; // Katakumby (~4 km)

      const estimates = calculateTransitEstimates(fromPt, farPt);

      expect(estimates.isLongWalk).toBe(true);
      expect(estimates.recommendedMode).toBe('transit');
      expect(estimates.isTransitEstimated).toBe(true);

      // Komunikat musi uczciwie informować o konieczności weryfikacji rozkładu
      expect(estimates.transitNotice).toBeDefined();
      expect(estimates.transitNotice).toContain('Sprawdź rozkład');
      expect(estimates.transitNotice).toContain('Mapach Google');

      // Nie wymyśla fikcyjnych numerów linii autobusowych
      expect(estimates.transitNotice).not.toContain('Autobus linii 175');
      expect(estimates.transitNotice).not.toContain('Metro B o 14:15');
    });

    test('calculateTransitEstimates dla krótkich tras (< 1.5 km) rekomenduje spacer', () => {
      const fromPt = { lat: 41.8902, lon: 12.4922 }; // Koloseum
      const closePt = { lat: 41.8925, lon: 12.4853 }; // Forum Romanum (~600m)

      const estimates = calculateTransitEstimates(fromPt, closePt);
      expect(estimates.isLongWalk).toBe(false);
      expect(estimates.recommendedMode).toBe('walking');
      expect(estimates.transitNotice).toBeUndefined();
    });
  });

  // =========================================================================
  // Scenariusz 17: OSRM nie jest prezentowany jako silnik uwzględniający rozkłady autobusów/tramwajów
  // =========================================================================
  describe('Scenariusz 17: OSRM jest ściśle silnikiem siatki drogowej, a nie rozkładów jazdy', () => {
    test('profil transportu OSRM jest ograniczony do siatki drogowej (driving/walking), a nie tranzytu miejskiego', async () => {
      const ptA: GeoPoint = { id: 'a', title: 'A', lat: 41.89, lon: 12.49 };
      const ptB: GeoPoint = { id: 'b', title: 'B', lat: 41.90, lon: 12.50 };

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        // Żądanie OSRM zawsze idzie do profilu driving lub walking, NIGDY transit
        expect(url).not.toContain('/transit/');
        expect(url).not.toContain('/bus/');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 100],
              [100, 0],
            ],
          }),
        } as Response;
      });

      await fetchOsrmRoadMatrix([ptA, ptB], { profile: 'driving' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    test('przekierowanie do nawigacji tranzytowej kieruje bezpośrednio do Google Maps', () => {
      const url = buildGoogleMapsDirectionsUrl(
        { lat: 41.8902, lon: 12.4922, title: 'Koloseum' },
        { lat: 41.9022, lon: 12.4539, title: 'Watykan' },
        'transit'
      );

      expect(url).toContain('travelmode=transit');
      expect(url).toContain('origin=41.8902,12.4922');
      expect(url).toContain('destination=41.9022,12.4539');
    });
  });
});
