/// <reference types="jest" />
import React from 'react';
import { render } from '@testing-library/react-native';
import { ScrollView, KeyboardAvoidingView } from 'react-native';
import { LoginRegisterScreen } from '../src/screens/auth/LoginRegisterScreen';
import { Step1DestinationScreen } from '../src/screens/TripCreator/Step1DestinationScreen';
import { Step3LodgingScreen } from '../src/screens/TripCreator/Step3LodgingScreen';

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    isGuest: false,
    language: 'pl',
    setLanguage: jest.fn(),
    setUser: jest.fn(),
    continueAsGuest: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: (selector?: (s: any) => any) => {
    const state = {
      destination: 'Rzym',
      lodgingAddress: '',
      setLodgingAddress: jest.fn(),
      setStep1Data: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

describe('Obsługa klawiatury i ScrollView - Dostęp do dolnej części ekranu', () => {
  test('1. LoginRegisterScreen musi zawierać KeyboardAvoidingView oraz ScrollView z keyboardShouldPersistTaps="handled"', () => {
    const { UNSAFE_getAllByType } = render(<LoginRegisterScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('2. Step1DestinationScreen musi zawierać KeyboardAvoidingView i ScrollView dla swobodnego wpisywania', () => {
    const { UNSAFE_getAllByType } = render(<Step1DestinationScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('3. Step3LodgingScreen musi zawierać KeyboardAvoidingView i ScrollView dla wpisywania adresu noclegu', () => {
    const { UNSAFE_getAllByType } = render(<Step3LodgingScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('4. QuickSetupScreen musi zawierać KeyboardAvoidingView oraz ScrollView z keyboardShouldPersistTaps="handled"', () => {
    const { QuickSetupScreen } = require('../src/screens/QuickSetupScreen');
    const mockRoute = {
      params: {
        destData: {
          city: 'Wenecja',
          recommendedTransport: 'flight',
          proposedTrip: {
            startDate: '10-10-2026',
            endDate: '15-10-2026',
            itinerary: [{ attractions: ['San Marco'] }]
          }
        }
      }
    };
    const { UNSAFE_getAllByType } = render(<QuickSetupScreen route={mockRoute} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('Detekcja kolizji dat podróży (Overlapping Trips Prevention)', () => {
  const { isDateRangeOverlapping, checkTripCollision, parseTripDate } = require('../src/lib/tripCollision');

  test('isDateRangeOverlapping: poprawnie wykrywa nakładające się zakresy dat', () => {
    const s1 = parseTripDate('10-10-2026')!;
    const e1 = parseTripDate('15-10-2026')!;

    // Nakładanie częściowe (druga podróż zaczyna się w trakcie pierwszej)
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('12-10-2026')!, parseTripDate('18-10-2026')!)).toBe(true);

    // Druga podróż zawiera się całkowicie w pierwszej
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('11-10-2026')!, parseTripDate('13-10-2026')!)).toBe(true);

    // Pierwsza podróż zawiera się całkowicie w drugiej
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('01-10-2026')!, parseTripDate('20-10-2026')!)).toBe(true);

    // Podróże stykają się w ten sam dzień (graniczny przypadek)
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('15-10-2026')!, parseTripDate('20-10-2026')!)).toBe(true);
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('05-10-2026')!, parseTripDate('10-10-2026')!)).toBe(true);
  });

  test('isDateRangeOverlapping: poprawnie zwraca false dla rozłącznych przedziałów', () => {
    const s1 = parseTripDate('10-10-2026')!;
    const e1 = parseTripDate('15-10-2026')!;

    // Całkowicie przed
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('01-10-2026')!, parseTripDate('09-10-2026')!)).toBe(false);

    // Całkowicie po
    expect(isDateRangeOverlapping(s1, e1, parseTripDate('16-10-2026')!, parseTripDate('22-10-2026')!)).toBe(false);
  });

  test('checkTripCollision: odnajduje kolidującą wycieczkę w SQLite', async () => {
    const mockDb = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'trip-abc',
            trip_name: 'Wypad do Berlina',
            start_date: '2026-11-01',
            end_date: '2026-11-07',
          }
        ]
      })
    };

    // Planowanie na 05-11-2026 do 10-11-2026 (nakłada się na Berlin)
    const collision = await checkTripCollision(mockDb, 'user-1', '05-11-2026', '10-11-2026');
    expect(collision).not.toBeNull();
    expect(collision?.trip_name).toBe('Wypad do Berlina');
    expect(collision?.start_date).toBe('01-11-2026');
    expect(collision?.end_date).toBe('07-11-2026');

    // Planowanie na inny termin (brak kolizji)
    const noCollision = await checkTripCollision(mockDb, 'user-1', '15-11-2026', '20-11-2026');
    expect(noCollision).toBeNull();
  });
});
