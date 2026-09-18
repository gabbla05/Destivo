/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeScreen } from '../src/screens/HomeScreen';
import { generateLiveRecommendations } from '../src/lib/liveExplore';

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', name: 'Alicja' },
    isGuest: false,
    language: 'pl',
  }),
}));

const mockExecute = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('../src/lib/liveExplore', () => ({
  generateLiveRecommendations: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: any) => {
    callback();
  },
}));

describe('HomeScreen - Rekomendacje podróży i interfejs główny', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockRecommendations = [
    {
      id: 'rome_01',
      city: 'Rzym',
      country: 'Włochy',
      lat: 41.9028,
      lon: 12.4964,
      coverImage: 'https://images.unsplash.com/photo-rome.jpg',
      shortDescription: 'Wieczne miasto.',
      transportCode: 'ROM',
      distanceKm: 1300,
      recommendedTransport: 'flight' as const,
      nearestAirport: 'WAW',
      flightDate: '20.09.2026 - 23.09.2026',
      hasPredefinedPlan: true,
      proposedTrip: {
        startDate: '20.09.2026',
        endDate: '23.09.2026',
        durationDays: 3,
        estimatedTemp: 22,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Umiarkowany ruch',
        itinerary: [{ day: 1, title: 'Dzień 1', attractions: ['Koloseum'] }],
      },
    },
    {
      id: 'bari_01',
      city: 'Bari',
      country: 'Włochy',
      lat: 41.1171,
      lon: 16.8719,
      coverImage: 'https://images.unsplash.com/photo-bari.jpg',
      shortDescription: 'Słoneczna Apulia.',
      transportCode: 'BRI',
      distanceKm: 1250,
      recommendedTransport: 'flight' as const,
      nearestAirport: 'KRK',
      flightDate: '22.09.2026 - 25.09.2026',
      hasPredefinedPlan: false,
      proposedTrip: {
        startDate: '22.09.2026',
        endDate: '25.09.2026',
        durationDays: 3,
        estimatedTemp: 25,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Spokojnie',
        itinerary: [],
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [], array: [] });
    (generateLiveRecommendations as jest.Mock).mockResolvedValue(mockRecommendations);
  });

  test('1. renderuje powitanie użytkownika i przyciski nawigacji', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Alicja/i)).toBeTruthy();
      expect(screen.getByText(/Gdzie wyruszamy tym razem\?/i)).toBeTruthy();
      expect(screen.getByText(/\+ Utwórz swoją własną podróż/i)).toBeTruthy();
      expect(screen.getByText(/Przejdź do swoich podróży/i)).toBeTruthy();
    });
  });

  test('2. kliknięcie przycisków głównych kieruje odpowiednio do kreatora i listy podróży', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/\+ Utwórz swoją własną podróż/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByText(/\+ Utwórz swoją własną podróż/i));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripCreator');

    fireEvent.press(screen.getByText(/Przejdź do swoich podróży/i));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Trips');
  });

  test('3. renderuje kafelki rekomendacji z poprawnymi danymi (Gotowy plan vs Wymaga własnego planu)', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
      expect(screen.getByText('Bari')).toBeTruthy();
    });

    // Rzym ma gotowy plan
    expect(screen.getAllByText(/Gotowy plan/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/3-dniowy gotowy plan wycieczki/i)).toBeTruthy();

    // Bari nie ma gotowego planu
    expect(screen.getByText(/Wymaga własnego planu/i)).toBeTruthy();

    // Pastylka transportu
    expect(screen.getAllByText(/✈️ Lot/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/z WAW/i)).toBeTruthy();
    expect(screen.getByText(/z KRK/i)).toBeTruthy();
  });

  test('4. kliknięcie kafelka rekomendacji przekierowuje do ExploreDetails z danymi destynacji', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Rzym'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('ExploreDetails', {
      destData: mockRecommendations[0],
    });
  });

  test('5. renderuje komunikat pustej listy rekomendacji gdy brak wyników', async () => {
    (generateLiveRecommendations as jest.Mock).mockResolvedValue([]);

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Brak bezpiecznych rekomendacji na ten moment/i)).toBeTruthy();
    });
  });

  test('6. w widoku aktywnej podróży renderuje oś czasu, przelicznik walut i numery alarmowe', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const activeTripDbRow = {
      id: 'active-trip-1',
      trip_name: 'Wyprawa do Włoch',
      destination: 'Rzym',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-1', title: 'Koloseum', time: '10:00', description: 'Zwiedzanie amfiteatru', status: 'IN_PROGRESS' },
          { id: 'ev-2', title: 'Panteon', time: '14:00', description: 'Antyczna świątynia', status: 'TODO' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [activeTripDbRow],
      array: [activeTripDbRow],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Podróż do Rzym/i)).toBeTruthy();
      expect(screen.getByText('Koloseum')).toBeTruthy();
      expect(screen.getByText('Panteon')).toBeTruthy();
      expect(screen.getByText('W TRAKCIE')).toBeTruthy();
      expect(screen.getByText(/Kalkulator Walut/i)).toBeTruthy();
      expect(screen.getByText(/Lokalny numer alarmowy/i)).toBeTruthy();
    });
  });
});
