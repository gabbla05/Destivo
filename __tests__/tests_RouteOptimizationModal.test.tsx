// __tests__/tests_RouteOptimizationModal.test.tsx
import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { RouteOptimizationModal } from '../src/components/RouteOptimizationModal';
import { OSRM_MATRIX_CACHE, clearInFlightOsrmRequests } from '../src/lib/routeOptimization';
import * as routeOptimization from '../src/lib/routeOptimization';

// Mock authStore
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    language: 'pl',
  }),
}));

describe('Komponent RouteOptimizationModal (Praktyczna optymalizacja trasy bez żargonu)', () => {
  const mockOnClose = jest.fn();
  const mockOnApply = jest.fn();

  const mockEvents = [
    {
      id: 'evt_1',
      type: 'ATTRACTION',
      title: 'Watykan',
      subtitle: 'Zwiedzanie',
      dateStr: '10-10-2026',
      timeStr: '10:00',
      parsedDate: new Date('2026-10-10T10:00:00Z'),
    },
    {
      id: 'evt_2',
      type: 'ATTRACTION',
      title: 'Koloseum',
      subtitle: 'Zwiedzanie',
      dateStr: '10-10-2026',
      timeStr: '12:00',
      parsedDate: new Date('2026-10-10T12:00:00Z'),
    },
    {
      id: 'evt_3',
      type: 'ATTRACTION',
      title: 'Panteon',
      subtitle: 'Zwiedzanie',
      dateStr: '10-10-2026',
      timeStr: '14:00',
      parsedDate: new Date('2026-10-10T14:00:00Z'),
    },
  ];

  const mockOsrmTableResponse = () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const coordinateCount = String(url).split('?')[0].split('/').pop()?.split(';').length || 0;
      const durations = Array.from({ length: coordinateCount }, (_, from) =>
        Array.from({ length: coordinateCount }, (_, to) => (from === to ? 0 : 60))
      );
      const distances = durations.map((row) => row.map((duration) => duration * 10));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ code: 'Ok', durations, distances }),
      } as Response;
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OSRM_MATRIX_CACHE.clear();
    clearInFlightOsrmRequests();
    process.env.NODE_ENV = 'test';
  });

  test('nie renderuje się, gdy visible={false}', () => {
    const { toJSON } = render(
      <RouteOptimizationModal
        visible={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
      />
    );
    expect(toJSON()).toBeNull();
  });

  test('wyświetla komunikat o braku wystarczającej liczby punktów, gdy atrakcji < 2', () => {
    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={[mockEvents[0]]}
      />
    );

    expect(screen.getByText(/Dodaj co najmniej 2 miejsca, aby ułożyć trasę/i)).toBeTruthy();
  });

  test('wyświetla uporządkowany plan, przycisk całej trasy i opcje dojazdu bez sztucznych oznak AI i ptaszków', () => {
    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // Naturalny nagłówek modala bez "(TSP)" ani "Zoptymalizowany..."
    expect(screen.getByText('Plan dnia')).toBeTruthy();
    expect(screen.getByText('Uporządkowana trasa według lokalizacji')).toBeTruthy();

    // Usunięte niepotrzebne ptaszki ("Optymalna kolejność...", "Brak zbędnego zawracania...")
    expect(screen.queryByText('Optymalna kolejność zwiedzania')).toBeNull();
    expect(screen.queryByText('Brak zbędnego zawracania po mieście')).toBeNull();
    expect(screen.queryByText('Wszystkie punkty ułożone w logiczną trasę')).toBeNull();

    // Zostawiony wyłącznie przycisk całej trasy w Google Maps
    expect(screen.getByText('Zobacz całą trasę w Google Maps')).toBeTruthy();

    // Brak sztywnych liczb kilometrów ani sztucznych haseł AI
    expect(screen.queryByText(/^Zaoszczędzony dystans$/i)).toBeNull();
    expect(screen.queryByText(/^Oszczędność czasu$/i)).toBeNull();
    expect(screen.queryByText(/Łączny czas/i)).toBeNull();
    expect(screen.queryByText(/Poglądowo/i)).toBeNull();

    // Kolejność przystanków
    expect(screen.getByText('Kolejność przystanków')).toBeTruthy();

    // Brak tabeli porównawczej algorytmów ani technicznego żargonu
    expect(screen.queryByText(/Porównanie algorytmów/i)).toBeNull();
    expect(screen.queryByText(/Algorytm Zachłanny/i)).toBeNull();
    expect(screen.queryByText(/CPU time/i)).toBeNull();
    expect(screen.queryByText(/\(TSP\)/i)).toBeNull();

    // Usunięte zbędne przyciski trybów (pieszo, komunikacja, auto) - zostawiona rekomendacja i przycisk Google Maps
    expect(screen.queryByText('Samochód / taxi')).toBeNull();
    expect(screen.getAllByText(/Rekomendowany transport:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Wskazówki w Google Maps').length).toBeGreaterThan(0);
  });

  test('kliknięcie nawigacji oraz całej trasy otwiera Google Maps z bieżącej lokalizacji', () => {
    const spyOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // 1. Sprawdzenie kliknięcia nawigacji bezpośredniej do punktu
    fireEvent.press(screen.getByTestId('preview-point-maps-btn-0'));
    const pointUrl = spyOpenURL.mock.calls[spyOpenURL.mock.calls.length - 1][0];
    expect(pointUrl).toContain('https://www.google.com/maps/dir/?api=1');
    expect(pointUrl).toContain('destination=');
    expect(pointUrl).not.toContain('origin=');

    // 2. Przycisk całej trasy ze wszystkimi przystankami w Google Maps
    fireEvent.press(screen.getByTestId('view-full-route-maps-btn'));
    const fullRouteUrl = spyOpenURL.mock.calls[spyOpenURL.mock.calls.length - 1][0];
    expect(fullRouteUrl).toContain('https://www.google.com/maps/dir/?api=1');
    expect(fullRouteUrl).toContain('origin=');
    expect(fullRouteUrl).toContain('destination=');
    expect(fullRouteUrl).toContain('waypoints=');

    // 3. Przycisk odcinkowy Google Maps (z aktualnej lokalizacji do punktu docelowego)
    const mapsButtons = screen.getAllByText('Wskazówki w Google Maps');
    fireEvent.press(mapsButtons[0]);
    const lastCalledUrl = spyOpenURL.mock.calls[spyOpenURL.mock.calls.length - 1][0];
    expect(lastCalledUrl).toContain('https://www.google.com/maps/dir/?api=1');
    expect(lastCalledUrl).toContain('destination=');
    expect(lastCalledUrl).not.toContain('origin=');

    spyOpenURL.mockRestore();
  });

  test('kliknięcie "Zapisz kolejność" wywołuje onApply z uszeregowanymi wydarzeniami i nowymi godzinami', async () => {
    mockOsrmTableResponse();
    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Zapisz kolejność'));

    expect(mockOnApply).toHaveBeenCalledTimes(1);
    const appliedEvents = mockOnApply.mock.calls[0][0];
    expect(appliedEvents.length).toBe(3);
    expect(appliedEvents[0].timeStr).toBe('10:00');
    expect(appliedEvents[1].timeStr).toBe('11:51');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('kliknięcie "Anuluj" wywołuje onClose bez modyfikacji trasy', () => {
    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
      />
    );

    fireEvent.press(screen.getByText('Anuluj'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnApply).not.toHaveBeenCalled();
  });

  test('dla wyjazdu wielodniowego wyświetla zakładki dni i poprawnie rozdziela atrakcje na poszczególne dni', async () => {
    mockOsrmTableResponse();
    const multiDayEvents = [
      {
        id: 'evt_d1_dep',
        type: 'DEPARTURE',
        title: 'Wylot do Rzymu',
        dateStr: '10-09-2026',
        timeStr: '08:00',
        parsedDate: new Date('2026-09-10T08:00:00Z'),
      },
      {
        id: 'evt_d1_attr',
        type: 'ATTRACTION',
        title: 'Koloseum',
        dateStr: '10-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-10T10:00:00Z'),
        lat: 41.8902,
        lon: 12.4922,
      },
      {
        id: 'evt_d1_hotel',
        type: 'LODGING',
        title: 'Hotel Colosseum',
        dateStr: '10-09-2026',
        timeStr: '20:00',
        parsedDate: new Date('2026-09-10T20:00:00Z'),
      },
      {
        id: 'evt_d2_attr',
        type: 'ATTRACTION',
        title: 'Watykan',
        dateStr: '11-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-11T10:00:00Z'),
        lat: 41.9022,
        lon: 12.4539,
      },
      {
        id: 'evt_d2_hotel',
        type: 'LODGING',
        title: 'Hotel Colosseum',
        dateStr: '11-09-2026',
        timeStr: '20:00',
        parsedDate: new Date('2026-09-11T20:00:00Z'),
      },
    ];

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={multiDayEvents}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Sprawdzamy obecność zakładek zakresu
    expect(screen.getByTestId('scope-tab-all')).toBeTruthy();
    expect(screen.getByTestId('scope-tab-day-0')).toBeTruthy();
    expect(screen.getByTestId('scope-tab-day-1')).toBeTruthy();

    // Klikamy "Zapisz kolejność" dla całego wyjazdu
    await waitFor(() => {
      expect(screen.queryByTestId('osrm-loading-banner')).toBeNull();
    });
    fireEvent.press(screen.getByText('Zapisz kolejność'));

    expect(mockOnApply).toHaveBeenCalledTimes(1);
    const applied = mockOnApply.mock.calls[0][0];

    // Atrakcja Dnia 1 ma datę Dnia 1
    const d1Attrs = applied.filter((e: any) => e.type === 'ATTRACTION' && e.dateStr === '10-09-2026');
    // Atrakcja Dnia 2 ma datę Dnia 2
    const d2Attrs = applied.filter((e: any) => e.type === 'ATTRACTION' && e.dateStr === '11-09-2026');

    expect(d1Attrs.length).toBe(1);
    expect(d2Attrs.length).toBe(1);

    // Kolejność chronologiczna bez mieszania
    const d1AttrIdx = applied.findIndex((e: any) => e.id === d1Attrs[0].id);
    const d2AttrIdx = applied.findIndex((e: any) => e.id === d2Attrs[0].id);
    const d1HotelIdx = applied.findIndex((e: any) => e.id === 'evt_d1_hotel');

    expect(d1AttrIdx).toBeLessThan(d1HotelIdx);
    expect(d1HotelIdx).toBeLessThan(d2AttrIdx);
  });

  test('cały wyjazd pobiera osobne macierze z hotelem dla każdego dnia i nie łączy odcinków między dniami', async () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const multiDayEvents = [
      {
        id: 'hotel_day_1',
        type: 'LODGING',
        title: 'Hotel Dzień 1',
        dateStr: '10-09-2026',
        timeStr: '18:00',
        parsedDate: new Date('2026-09-10T18:00:00Z'),
        lat: 41.8900,
        lon: 12.4900,
      },
      {
        id: 'day_1_a',
        type: 'ATTRACTION',
        title: 'Atrakcja 1A',
        dateStr: '10-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-10T10:00:00Z'),
        lat: 41.8910,
        lon: 12.4910,
      },
      {
        id: 'day_1_b',
        type: 'ATTRACTION',
        title: 'Atrakcja 1B',
        dateStr: '10-09-2026',
        timeStr: '12:00',
        parsedDate: new Date('2026-09-10T12:00:00Z'),
        lat: 41.8920,
        lon: 12.4920,
      },
      {
        id: 'hotel_day_2',
        type: 'LODGING',
        title: 'Hotel Dzień 2',
        dateStr: '11-09-2026',
        timeStr: '18:00',
        parsedDate: new Date('2026-09-11T18:00:00Z'),
        lat: 41.9000,
        lon: 12.4500,
      },
      {
        id: 'day_2_a',
        type: 'ATTRACTION',
        title: 'Atrakcja 2A',
        dateStr: '11-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-11T10:00:00Z'),
        lat: 41.9010,
        lon: 12.4510,
      },
      {
        id: 'day_2_b',
        type: 'ATTRACTION',
        title: 'Atrakcja 2B',
        dateStr: '11-09-2026',
        timeStr: '12:00',
        parsedDate: new Date('2026-09-11T12:00:00Z'),
        lat: 41.9020,
        lon: 12.4520,
      },
    ];
    const requestedUrls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const requestUrl = String(url);
      requestedUrls.push(requestUrl);
      if (requestUrl.includes('/table/v1/')) {
        const coordinateCount = requestUrl.split('?')[0].split('/').pop()?.split(';').length || 0;
        const durations = Array.from({ length: coordinateCount }, (_, from) =>
          Array.from({ length: coordinateCount }, (_, to) => (from === to ? 0 : 90))
        );
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ code: 'Ok', durations, distances: durations }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ code: 'Ok', routes: [{ distance: 1000, duration: 600 }] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={multiDayEvents}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(requestedUrls.filter((url) => url.includes('/table/v1/')).length).toBe(2);
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
    });

    const matrixUrls = requestedUrls.filter((url) => url.includes('/table/v1/'));
    expect(matrixUrls[0]).toContain('12.49,41.89');
    expect(matrixUrls[1]).toContain('12.45,41.9');
    expect(screen.getAllByText('Hotel Dzień 1')).toHaveLength(2);
    expect(screen.getAllByText('Hotel Dzień 2')).toHaveLength(2);
    expect(screen.getAllByTestId(/transit-maps-btn-/)).toHaveLength(2);

    fireEvent.press(screen.getByTestId('maps-day-route-btn-0'));
    expect(openUrlSpy.mock.calls[0][0]).toContain('origin=41.89,12.49');
    expect(openUrlSpy.mock.calls[0][0]).toContain('destination=41.89,12.49');
    fireEvent.press(screen.getByTestId('maps-day-route-btn-1'));
    expect(openUrlSpy.mock.calls[1][0]).toContain('origin=41.9,12.45');
    expect(openUrlSpy.mock.calls[1][0]).toContain('destination=41.9,12.45');
    openUrlSpy.mockRestore();
  });

  test('zapis kolejności nie czeka na opcjonalne wskazówki dojazdu', async () => {
    const resolvePendingInfo: Array<(info: routeOptimization.StreetRouteInfo) => void> = [];
    const environmentSpy = jest.spyOn(routeOptimization, 'isTestEnvironment').mockReturnValue(false);
    const routeInfoSpy = jest.spyOn(routeOptimization, 'fetchRealRouteInfo').mockImplementation(
      () => new Promise((resolve) => resolvePendingInfo.push(resolve))
    );
    mockOsrmTableResponse();

    const { rerender } = render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents.slice(0, 2).map((event, index) => ({
          ...event,
          lat: 41.89 + index * 0.01,
          lon: 12.49 + index * 0.01,
        }))}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
      expect(routeInfoSpy).toHaveBeenCalled();
    });

    const applyButton = screen.getByTestId('confirm-apply-button');
    expect(applyButton.props.disabled).not.toBe(true);
    fireEvent.press(applyButton);
    expect(mockOnApply).toHaveBeenCalledTimes(1);

    rerender(
      <RouteOptimizationModal
        visible={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents.slice(0, 2)}
        destinationCity="Rzym"
      />
    );
    resolvePendingInfo.forEach((resolve) => resolve({
      walkMinutes: 10,
      walkDistanceKm: 1,
      transitMinutes: 8,
      driveMinutes: 5,
      driveDistanceKm: 1,
      straightDistanceKm: 0.8,
      recommendedMode: 'walking',
      isLongWalk: false,
      isTransitEstimated: true,
    }));
    routeInfoSpy.mockRestore();
    environmentSpy.mockRestore();
  });

  test('wyświetla ostrzeżenie o przybliżonych/zbitych współrzędnych, gdy punkty mają identyczne koordynaty (hasCollapsedCoordinates)', () => {
    const collapsedEvents = [
      {
        id: 'evt_c1',
        type: 'ATTRACTION',
        title: 'Nieznana kapliczka',
        dateStr: '10-10-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-10-10T10:00:00Z'),
        lat: 50.0647,
        lon: 19.9450,
      },
      {
        id: 'evt_c2',
        type: 'ATTRACTION',
        title: 'Lokalne źródełko',
        dateStr: '10-10-2026',
        timeStr: '11:00',
        parsedDate: new Date('2026-10-10T11:00:00Z'),
        lat: 50.0647,
        lon: 19.9450,
      },
    ];

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={collapsedEvents}
        destinationCity="Mała Wieś"
      />
    );

    // Banner ostrzegawczy z testID="collapsed-coordinates-warning" powinien być widoczny
    expect(screen.getByTestId('collapsed-coordinates-warning')).toBeTruthy();
  });

  test('wyświetla baner błędu OSRM z możliwością przełączenia na tryb przybliżony', async () => {
    // Symulujemy celowy błąd pobrania macierzy OSRM
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        throw new Error('OSRM_TEST_ERROR: Brak połączenia z serwerem OSRM');
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // Czekamy na obsłużenie błędu
    const errorBanner = await screen.findByTestId('osrm-error-banner');
    expect(errorBanner).toBeTruthy();
    expect(screen.getByText('Nie udało się pobrać danych drogowych')).toBeTruthy();

    // Klikamy "Użyj trybu przybliżonego (linia prosta)"
    const fallbackBtn = await screen.findByTestId('osrm-fallback-btn');
    fireEvent.press(fallbackBtn);

    // Powinien pojawić się banner trybu przybliżonego
    const approxBanner = await screen.findByTestId('approximate-mode-banner');
    expect(approxBanner).toBeTruthy();
    expect(screen.getByText('Tryb przybliżony (linia prosta)')).toBeTruthy();
  });

  test('wyświetla badge sieci drogowej OSRM po pomyślnym pobraniu macierzy', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 500, 700],
              [520, 0, 300],
              [710, 310, 0],
            ],
            distances: [
              [0, 2000, 3500],
              [2100, 0, 1500],
              [3600, 1550, 0],
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
      expect(screen.getByText('Sieć drogowa OSRM • Zoptymalizowano czas przejazdu')).toBeTruthy();
    });
  });

  test('szybka zmiana zakresu odrzuca spóźnioną odpowiedź OSRM (ochrona przed race condition)', async () => {
    let resolveFirstReq: (val: any) => void = () => {};
    const firstReqPromise = new Promise((resolve) => {
      resolveFirstReq = resolve;
    });

    let callCount = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        callCount++;
        if (callCount === 1) {
          // Pierwsze zapytanie zwleka
          await firstReqPromise;
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              code: 'Ok',
              durations: [
                [0, 9999, 9999],
                [9999, 0, 9999],
                [9999, 9999, 0],
              ],
            }),
          } as Response;
        } else {
          // Drugie zapytanie odpowiada natychmiast
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              code: 'Ok',
              durations: [
                [0, 150],
                [150, 0],
              ],
            }),
          } as Response;
        }
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    const multiDayEvents = [
      {
        id: 'ev_d1_1',
        type: 'ATTRACTION',
        title: 'Koloseum',
        dateStr: '10-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-10T10:00:00Z'),
        lat: 41.8902,
        lon: 12.4922,
      },
      {
        id: 'ev_d1_2',
        type: 'ATTRACTION',
        title: 'Watykan',
        dateStr: '10-09-2026',
        timeStr: '14:00',
        parsedDate: new Date('2026-09-10T14:00:00Z'),
        lat: 41.9022,
        lon: 12.4539,
      },
      {
        id: 'ev_d2_1',
        type: 'ATTRACTION',
        title: 'Panteon',
        dateStr: '11-09-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-09-11T10:00:00Z'),
        lat: 41.8986,
        lon: 12.4769,
      },
    ];

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={multiDayEvents}
        destinationCity="Rzym"
      />
    );

    // Przełączamy zakres na Dzień 1 (generując drugie zapytanie)
    fireEvent.press(screen.getByTestId('scope-tab-day-0'));

    // Drugie zapytanie powinno się zakończyć sukcesem
    await waitFor(() => {
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
    });

    // Teraz spóźniona pierwsza odpowiedź powraca
    resolveFirstReq(true);

    // Badge nadal musi być widoczny i reprezentować aktywny zakres (nie może nastąpić błąd ani wyścig stanów)
    expect(screen.getByTestId('road-network-badge')).toBeTruthy();
  });

  test('w trybie przybliżonym badge sieci drogowej NIGDY się nie pojawia, a widoczny jest baner przybliżony', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        throw new Error('OSRM_TEST_ERROR: offline');
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    const fallbackBtn = await screen.findByTestId('osrm-fallback-btn');
    fireEvent.press(fallbackBtn);

    // W trybie przybliżonym:
    expect(screen.queryByTestId('road-network-badge')).toBeNull();
    expect(screen.getByTestId('approximate-mode-banner')).toBeTruthy();
  });

  test('atrakcja z poprawnymi współrzędnymi lat: 0, lon: 0 (Null Island/równik) nie jest traktowana jako brak współrzędnych', async () => {
    const zeroCoordsEvents = [
      {
        id: 'ev_zero_1',
        type: 'ATTRACTION',
        title: 'Punkt Zero',
        dateStr: '10-10-2026',
        timeStr: '10:00',
        parsedDate: new Date('2026-10-10T10:00:00Z'),
        lat: 0,
        lon: 0,
      },
      {
        id: 'ev_zero_2',
        type: 'ATTRACTION',
        title: 'Punkt Równikowy',
        dateStr: '10-10-2026',
        timeStr: '12:00',
        parsedDate: new Date('2026-10-10T12:00:00Z'),
        lat: 0,
        lon: 1,
      },
    ];

    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        expect(url).toContain('0,0;1,0');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 100],
              [100, 0],
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={zeroCoordsEvents}
        destinationCity="Atlantis"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('road-network-badge')).toBeTruthy();
    });
  });

  test('zmiana transportProfile natychmiast wysyła zapytanie z nowym profilem i unieważnia starą macierz', async () => {
    const urlsCalled: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string') {
        urlsCalled.push(url);
      }
      const data = {
        code: 'Ok',
        durations: [
          [0, 100, 200],
          [100, 0, 150],
          [200, 150, 0],
        ],
      };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => data,
        text: async () => JSON.stringify(data),
      } as Response;
    });

    const { rerender } = render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
        transportProfile="driving"
      />
    );

    await waitFor(() => {
      expect(urlsCalled.some((u) => u.includes('/table/v1/driving/'))).toBe(true);
    });

    // Zmiana profilu na 'walking'
    rerender(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
        transportProfile="walking"
      />
    );

    await waitFor(() => {
      expect(urlsCalled.some((u) => u.includes('/table/v1/walking/') || u.includes('/table/v1/foot/'))).toBe(true);
    });
  });

  test('zamknięcie modala natychmiast unieważnia oczekujące zapytanie asynchroniczne', async () => {
    let resolveOsrm: any;
    const pendingPromise = new Promise((resolve) => {
      resolveOsrm = resolve;
    });

    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        await pendingPromise;
        const data = {
          code: 'Ok',
          durations: [
            [0, 100, 200],
            [100, 0, 150],
            [200, 150, 0],
          ],
        };
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => data,
          text: async () => JSON.stringify(data),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ routes: [] }),
      } as Response;
    });

    const { rerender } = render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // Modal otwarty, zapytanie w toku
    expect(screen.getByTestId('osrm-loading-banner')).toBeTruthy();

    // Zamykamy modal przed nadejściem odpowiedzi
    rerender(
      <RouteOptimizationModal
        visible={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // Odpowiedź nadeszła po zamknięciu
    resolveOsrm();

    // Ponowne otwarcie modala nie może używać poprzedniego stanu sukcesu
    rerender(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    expect(screen.queryByTestId('road-network-badge')).toBeNull();
  });

  test('odpowiedź OSRM z wartością null (odcinek nieosiągalny) wyświetla błąd OSRM_UNREACHABLE_POINTS, brak badge drogowego i pozwala przejść na oznaczony tryb przybliżony', async () => {
    // Symulacja odpowiedzi OSRM Table API zawierającej null (brak przejazdu między punktami 0 i 1)
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/table/v1/')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, null, 500],
              [450, 0, 300],
              [500, 300, 0],
            ],
            distances: [
              [0, null, 4000],
              [3500, 0, 2000],
              [4000, 2000, 0],
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    // 1. Wykrycie błędu odcinków nieprzejezdnych
    const errorBanner = await screen.findByTestId('osrm-error-banner');
    expect(errorBanner).toBeTruthy();
    expect(screen.getByText(/OSRM_UNREACHABLE_POINTS/i)).toBeTruthy();
    expect(screen.getByText(/Watykan.*Koloseum/i)).toBeTruthy();

    // 2. Bezwzględny brak potwierdzonego badge sieci drogowej
    expect(screen.queryByTestId('road-network-badge')).toBeNull();

    // 3. Użytkownik decyduje się na jawny fallback do trybu przybliżonego
    const fallbackBtn = await screen.findByTestId('osrm-fallback-btn');
    fireEvent.press(fallbackBtn);

    // 4. Prezentacja jawnego banera trybu przybliżonego z zastrzeżeniem o braku gwarancji przejezdności
    const approxBanner = await screen.findByTestId('approximate-mode-banner');
    expect(approxBanner).toBeTruthy();
    expect(screen.getByText(/Tryb przybliżony \(linia prosta\)/i)).toBeTruthy();
    expect(screen.getByText(/przejezdność nie jest gwarantowana/i)).toBeTruthy();
    expect(screen.queryByTestId('road-network-badge')).toBeNull();
  });

  test('dla profilu "walking" badge prezentuje "Sieć piesza OSRM • Zoptymalizowano czas przejścia"', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && (url.includes('/table/v1/walking/') || url.includes('/table/v1/foot/'))) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            code: 'Ok',
            durations: [
              [0, 600, 1200],
              [600, 0, 500],
              [1200, 500, 0],
            ],
            distances: [
              [0, 800, 1500],
              [800, 0, 600],
              [1500, 600, 0],
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ routes: [] }),
      } as Response;
    });

    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
        transportProfile="walking"
      />
    );

    const badge = await screen.findByTestId('road-network-badge');
    expect(badge).toBeTruthy();
    expect(screen.getByText('Sieć piesza OSRM • Zoptymalizowano czas przejścia')).toBeTruthy();
  });
});
