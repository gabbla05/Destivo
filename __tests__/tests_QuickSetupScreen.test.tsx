/// <reference types="jest" />
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QuickSetupScreen } from '../src/screens/QuickSetupScreen';
import { LiveDestination } from '../src/lib/liveExplore';

jest.spyOn(Alert, 'alert').mockImplementation(() => null);

const mockExecute = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-quick-1', isGuest: false },
    isGuest: false,
    language: 'pl',
  }),
}));

jest.mock('../src/lib/tripCollision', () => ({
  checkTripCollision: jest.fn().mockResolvedValue(null),
}));

describe('QuickSetupScreen - Szybka konfiguracja wycieczki', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const mockDayTripDestination: LiveDestination = {
    id: 'kazimierz_01',
    city: 'Kazimierz Dolny',
    country: 'Polska',
    lat: 51.3218,
    lon: 21.9472,
    coverImage: 'https://images.unsplash.com/photo-kazimierz.jpg',
    shortDescription: 'Malownicze miasteczko nad Wisłą.',
    transportCode: 'KAZ',
    distanceKm: 145,
    recommendedTransport: 'car',
    isDayTrip: true,
    hasPredefinedPlan: true,
    proposedTrip: {
      startDate: '20.09.2026',
      endDate: '20.09.2026',
      durationDays: 1,
      estimatedTemp: 21,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      crowdLevel: 'Spokojnie',
      itinerary: [
        { day: 1, title: 'Dzień 1', attractions: ['Rynek', 'Góra Trzech Krzyży'] },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [], array: [] });
  });

  test('1. dla wycieczki jednodniowej ustawia tę samą datę powrotu co wyjazdu i pokazuje odpowiednie etykiety', () => {
    render(
      <QuickSetupScreen
        route={{ params: { destData: mockDayTripDestination } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText('Kazimierz Dolny')).toBeTruthy();
    expect(screen.getByText(/Ten sam dzień/i)).toBeTruthy();
    expect(screen.getByText(/ADRES \/ PRZYSTANEK \(Opcjonalnie - brak noclegu\)/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/np\. Parking pod zamkiem, restauracja\.\.\./i)).toBeTruthy();
  });

  test('2. zmiana daty wyjazdu automatycznie synchronizuje datę powrotu dla jednodniówki', () => {
    render(
      <QuickSetupScreen
        route={{ params: { destData: mockDayTripDestination } }}
        navigation={mockNavigation}
      />
    );

    const inputs = screen.getAllByDisplayValue('20-09-2026');
    expect(inputs.length).toBe(2); // start and end date

    fireEvent.changeText(inputs[0], '25-09-2026');

    // Obie daty powinny zaktualizować się do 25-09-2026
    const updatedInputs = screen.getAllByDisplayValue('25-09-2026');
    expect(updatedInputs.length).toBe(2);
  });

  test('3. zapis jednodniowej wycieczki generuje poprawną oś czasu bez noclegów i meldunków', async () => {
    render(
      <QuickSetupScreen
        route={{ params: { destData: mockDayTripDestination } }}
        navigation={mockNavigation}
      />
    );

    const saveBtn = screen.getByText(/Zapisz i zakończ/i);
    fireEvent.press(saveBtn);

    await waitFor(() => {
      expect(mockExecute).toHaveBeenCalled();
      const insertCall = mockExecute.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('INSERT INTO trips')
      );
      expect(insertCall).toBeTruthy();
      
      const attractionsDataJson = insertCall[1][9];
      const parsed = JSON.parse(attractionsDataJson);
      
      // Sprawdzamy czy oś nie ma noclegów o 22:00 ani zameldowania
      const lodgingEvents = parsed.customTimeline.filter((e: any) => e.type === 'LODGING');
      expect(lodgingEvents.length).toBe(0);

      // Sprawdzamy czy punkty wyjazdu i powrotu są obecne z podtytułem 1-dniowym
      const departure = parsed.customTimeline.find((e: any) => e.type === 'DEPARTURE');
      expect(departure.subtitle).toContain('Wyprawa samochodem (1 dzień bez noclegu)');

      const ret = parsed.customTimeline.find((e: any) => e.type === 'RETURN');
      expect(ret.subtitle).toContain('Powrót tego samego dnia');

      // Sprawdzamy atrakcje
      expect(parsed.customTimeline.some((e: any) => e.title === 'Rynek')).toBe(true);
      expect(parsed.customTimeline.some((e: any) => e.title === 'Góra Trzech Krzyży')).toBe(true);

      expect(mockNavigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Trips' });
    });
  });
});
