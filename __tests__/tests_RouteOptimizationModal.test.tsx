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

    // Opcje dojazdu (pieszo, komunikacja miejska, auto) oraz przycisk Google Maps
    expect(screen.getAllByText('Pieszo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Komunikacja miejska').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Samochód / taxi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Wskazówki w Google Maps').length).toBeGreaterThan(0);
  });

  test('kliknięcie poszczególnych trybów oraz całej trasy otwiera Google Maps', () => {
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

    // 1. Sprawdzenie kliknięcia trybu Pieszo
    fireEvent.press(screen.getByTestId('mode-walk-item-0'));
    expect(spyOpenURL).toHaveBeenCalledWith(expect.stringContaining('travelmode=walking'));

    // 2. Sprawdzenie kliknięcia trybu Komunikacja
    fireEvent.press(screen.getByTestId('mode-transit-item-0'));
    expect(spyOpenURL).toHaveBeenCalledWith(expect.stringContaining('travelmode=transit'));

    // 3. Sprawdzenie kliknięcia trybu Auto
    fireEvent.press(screen.getByTestId('mode-drive-item-0'));
    expect(spyOpenURL).toHaveBeenCalledWith(expect.stringContaining('travelmode=driving'));

    // 4. Przycisk całej trasy ze wszystkimi przystankami w Google Maps
    fireEvent.press(screen.getByTestId('view-full-route-maps-btn'));
    const fullRouteUrl = spyOpenURL.mock.calls[spyOpenURL.mock.calls.length - 1][0];
    expect(fullRouteUrl).toContain('https://www.google.com/maps/dir/?api=1');
    expect(fullRouteUrl).toContain('origin=');
    expect(fullRouteUrl).toContain('destination=');
    expect(fullRouteUrl).toContain('waypoints=');

    // 5. Przycisk odcinkowy Google Maps
    const mapsButtons = screen.getAllByText('Wskazówki w Google Maps');
    fireEvent.press(mapsButtons[0]);
    const lastCalledUrl = spyOpenURL.mock.calls[spyOpenURL.mock.calls.length - 1][0];
    expect(lastCalledUrl).toContain('origin=');
    expect(lastCalledUrl).toContain('destination=');

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
});
