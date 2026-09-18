/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking, Alert } from 'react-native';
import { ExploreDetailsScreen } from '../src/screens/ExploreDetailsScreen';
import { useTripCreatorStore } from '../src/store/tripCreatorStore';
import { LiveDestination } from '../src/lib/liveExplore';

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    language: 'pl',
  }),
}));

const mockSetStep1Data = jest.fn();
jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: {
    getState: () => ({
      setStep1Data: mockSetStep1Data,
    }),
  },
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => null);

describe('ExploreDetailsScreen - Rygorystyczny zestaw testów jednostkowych', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const mockPredefinedDestination: LiveDestination = {
    id: 'rome_01',
    city: 'Rzym',
    country: 'Włochy',
    lat: 41.9028,
    lon: 12.4964,
    coverImage: 'https://images.unsplash.com/photo-rome.jpg',
    shortDescription: 'Wieczne Miasto z bogatą historią.',
    transportCode: 'ROM',
    distanceKm: 1300,
    recommendedTransport: 'flight',
    nearestAirport: 'WAW',
    flightDate: '20.09.2026 - 23.09.2026',
    hasPredefinedPlan: true,
    proposedTrip: {
      startDate: '20.09.2026',
      endDate: '23.09.2026',
      durationDays: 3,
      estimatedTemp: 23,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      crowdLevel: 'Umiarkowany ruch turystyczny',
      itinerary: [
        { day: 1, title: 'Dzień 1: Odkrywanie miasta', attractions: ['Koloseum', 'Forum Romanum'] },
        { day: 2, title: 'Dzień 2: Kultura i sztuka', attractions: ['Watykan', 'Panteon'] },
      ],
    },
  };

  const mockNoPlanDestination: LiveDestination = {
    id: 'bari_01',
    city: 'Bari',
    country: 'Włochy',
    lat: 41.1171,
    lon: 16.8719,
    coverImage: 'https://images.unsplash.com/photo-bari.jpg',
    shortDescription: 'Słoneczna stolica Apulii.',
    transportCode: 'BRI',
    distanceKm: 1250,
    recommendedTransport: 'flight',
    nearestAirport: 'KRK',
    flightDate: '22.09.2026 - 25.09.2026',
    hasPredefinedPlan: false,
    proposedTrip: {
      startDate: '22.09.2026',
      endDate: '25.09.2026',
      durationDays: 3,
      estimatedTemp: 25,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      crowdLevel: 'Spokojniejsza okolica, mniej turystów',
      itinerary: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  });

  test('1. [Dopasowanie do szablonu] renderuje pełny gotowy harmonogram i przycisk przejścia do szybkiej konfiguracji', () => {
    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedDestination } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText('Rzym')).toBeTruthy();
    expect(screen.getByText(/Dopasowano do bazy gotowych szablonów/i)).toBeTruthy();
    expect(screen.getByText(/Dzień 1/i)).toBeTruthy();
    expect(screen.getByText(/Koloseum/i)).toBeTruthy();
    expect(screen.getByText(/Forum Romanum/i)).toBeTruthy();

    const chooseBtn = screen.getByText(/Wybieram tę podróż!/i);
    fireEvent.press(chooseBtn);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('QuickSetup', {
      destData: mockPredefinedDestination,
    });
  });

  test('2. [Brak szablonu w bazie] renderuje informację o konieczności ułożenia własnego planu i przycisk kreatora', () => {
    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockNoPlanDestination } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText('Bari')).toBeTruthy();
    expect(screen.getByText(/Brak gotowego szablonu wycieczki/i)).toBeTruthy();
    expect(screen.getByText(/ułóż plan wyjazdu w naszym kreatorze/i)).toBeTruthy();

    const buildPlanBtn = screen.getAllByText(/Zbuduj własny plan/i)[0];
    fireEvent.press(buildPlanBtn);

    expect(mockSetStep1Data).toHaveBeenCalledWith({
      tripName: 'Wyprawa: Bari',
      origin: 'KRK',
      destination: 'Bari',
      startDate: '22-09-2026',
      endDate: '25-09-2026',
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripCreator');
  });

  test('3. [Transport: Lot] generuje i otwiera link Skyscanner z kodem najbliższego lotniska', async () => {
    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedDestination } }}
        navigation={mockNavigation}
      />
    );

    const checkFlightBtn = screen.getByText(/Sprawdź loty/i);
    fireEvent.press(checkFlightBtn);

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('skyscanner.pl/transport/loty/waw/rom')
      );
    });
  });

  test('4. [Transport: Kolej] dla pociągu otwiera link do Koleo', async () => {
    const trainDest: LiveDestination = {
      ...mockPredefinedDestination,
      city: 'Kraków',
      recommendedTransport: 'train',
    };

    render(
      <ExploreDetailsScreen
        route={{ params: { destData: trainDest } }}
        navigation={mockNavigation}
      />
    );

    const checkTrainBtn = screen.getByText(/Sprawdź Koleo/i);
    fireEvent.press(checkTrainBtn);

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('https://koleo.pl');
    });
  });

  test('5. [Transport: Samochód] dla auta otwiera trasę w Google Maps', async () => {
    const carDest: LiveDestination = {
      ...mockPredefinedDestination,
      city: 'Wieliczka',
      recommendedTransport: 'car',
      lat: 49.987,
      lon: 20.064,
    };

    render(
      <ExploreDetailsScreen
        route={{ params: { destData: carDest } }}
        navigation={mockNavigation}
      />
    );

    // Przycisk dolny "Wyznacz trasę"
    const checkRouteBtns = screen.getAllByText(/Wyznacz trasę/i);
    const bottomRouteBtn = checkRouteBtns[checkRouteBtns.length - 1];
    fireEvent.press(bottomRouteBtn);

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('google.com/maps/dir/?api=1&destination=49.987,20.064')
      );
    });
  });

  test('6. [Nocleg] przycisk noclegu otwiera stronę Booking.com z nazwą destynacji', async () => {
    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedDestination } }}
        navigation={mockNavigation}
      />
    );

    const lodgingBtn = screen.getByText(/Noclegi/i);
    fireEvent.press(lodgingBtn);

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('booking.com/searchresults.html?ss=Rzym')
      );
    });
  });

  test('7. [Błąd otwierania linku] wyświetla Alert gdy Linking.canOpenURL zwraca false', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);

    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedDestination } }}
        navigation={mockNavigation}
      />
    );

    const lodgingBtn = screen.getByText(/Noclegi/i);
    fireEvent.press(lodgingBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.any(String));
    });
  });

  test('8. [Nawigacja wstecz] kliknięcie strzałki cofa ekran (goBack)', () => {
    render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedDestination } }}
        navigation={mockNavigation}
      />
    );

    const backBtn = screen.getByTestId('explore-back-button');
    fireEvent.press(backBtn);

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
