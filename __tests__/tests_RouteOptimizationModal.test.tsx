// __tests__/tests_RouteOptimizationModal.test.tsx
import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RouteOptimizationModal } from '../src/components/RouteOptimizationModal';

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

  beforeEach(() => {
    jest.clearAllMocks();
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

  test('kliknięcie "Zapisz kolejność" wywołuje onApply z uszeregowanymi wydarzeniami i nowymi godzinami', () => {
    render(
      <RouteOptimizationModal
        visible={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        events={mockEvents}
        destinationCity="Rzym"
      />
    );

    fireEvent.press(screen.getByText('Zapisz kolejność'));

    expect(mockOnApply).toHaveBeenCalledTimes(1);
    const appliedEvents = mockOnApply.mock.calls[0][0];
    expect(appliedEvents.length).toBe(3);
    expect(appliedEvents[0].timeStr).toBe('10:00');
    expect(appliedEvents[1].timeStr).toBe('11:41');
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

  test('dla wyjazdu wielodniowego wyświetla zakładki dni i poprawnie rozdziela atrakcje na poszczególne dni', () => {
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

    // Sprawdzamy obecność zakładek zakresu
    expect(screen.getByTestId('scope-tab-all')).toBeTruthy();
    expect(screen.getByTestId('scope-tab-day-0')).toBeTruthy();
    expect(screen.getByTestId('scope-tab-day-1')).toBeTruthy();

    // Klikamy "Zapisz kolejność" dla całego wyjazdu
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
});

