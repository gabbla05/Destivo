/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Importy testowanych ekranów
import { TripsListScreen } from '../src/screens/TripsListScreen';
import { TimelineScreen } from '../src/screens/TimelineScreen';
import { QuickSetupScreen } from '../src/screens/QuickSetupScreen';
import { Step4AttractionsScreen } from '../src/screens/TripCreator/Step4AttractionsScreen';

// --------------------------------------------------------------------------
// STAŁE I MOCKOWANIE ZALEŻNOŚCI
// --------------------------------------------------------------------------
const MOCK_CURRENT_DATE = new Date('2026-09-02T10:00:00Z');

// 1. Mock Auth Store
const mockAuthState = {
  user: { id: 'test-user-id', email: 'test@destivo.io', isGuest: false },
  isGuest: false,
  language: 'pl',
};

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// 2. Mock Trip Creator Store (dla Step 4)
const mockResetTrip = jest.fn();
jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: () => ({
    tripName: 'Moja super podróż',
    origin: 'Warszawa',
    destination: 'Rzym',
    startDate: '10-09-2026',
    endDate: '15-09-2026',
    transport: { selectedOption: { type: 'flight' } },
    transportDetails: {},
    lodging: {},
    lodgingAddress: 'Colosseum, Rome',
    attractions: { selected: ['Panteon'] },
    reset: mockResetTrip,
  }),
}));

// 3. Mock PowerSync (dla QuickSetupScreen)
const mockDbExecute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

// 4. Poprawione mockowanie Supabase z pełnym łańcuchem metod zwracającym Promise
const mockSupabaseEq = jest.fn().mockImplementation(() => ({
  order: mockSupabaseOrder,
  limit: mockSupabaseLimit,
  then: (resolve: any) => resolve({ data: mockTripsData, error: null }),
}));

const mockSupabaseOrder = jest.fn().mockImplementation(() => ({
  limit: mockSupabaseLimit,
  then: (resolve: any) => resolve({ data: mockTripsData, error: null }),
}));

const mockSupabaseLimit = jest.fn().mockImplementation(() => ({
  then: (resolve: any) => resolve({ data: mockTripsData, error: null }),
}));

const mockSupabaseInsert = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = jest.fn().mockImplementation(() => ({
  eq: jest.fn().mockResolvedValue({ error: null })
}));
const mockSupabaseDelete = jest.fn().mockImplementation(() => ({
  eq: jest.fn().mockResolvedValue({ error: null })
}));

const mockSupabaseSelect = jest.fn().mockImplementation(() => ({
  eq: mockSupabaseEq,
  order: mockSupabaseOrder,
  limit: mockSupabaseLimit,
  then: (resolve: any) => resolve({ data: mockTripsData, error: null }),
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: mockSupabaseSelect,
      insert: mockSupabaseInsert,
      update: mockSupabaseUpdate,
      delete: mockSupabaseDelete,
    })),
  },
}));

// 5. Mock React Navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const findPressableAncestor = (node: any): any => {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  return current;
};

jest.mock('@react-navigation/native', () => {
  const executedCallbacks = new Set<() => void>();

  return {
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      canGoBack: () => true,
    }),
    useFocusEffect: jest.fn((cb: () => void) => {
      if (!executedCallbacks.has(cb)) {
        executedCallbacks.add(cb);
        cb();
      }
    }),
  };
});

// 6. Mock Expo Location / Constants
jest.mock('expo-constants', () => ({
  expoConfig: { android: { config: { googleMaps: { apiKey: 'TEST_API_KEY' } } } },
}));

// 7. Globalne mocki (Fetch, Alert) z obsługą .json()
const mockFetch = jest.fn().mockImplementation((url: string) => {
  if (url.includes('nominatim')) {
    return Promise.resolve({
      ok: true,
      json: async () => [{ lat: '48.85', lon: '2.35' }],
    });
  }
  if (url.includes('googleapis')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          { place_id: 'g1', name: 'Koloseum', photos: [{ photo_reference: 'ref1' }] }
        ]
      }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ([]),
  });
});

globalThis.fetch = mockFetch as any;

jest.spyOn(Alert, 'alert').mockImplementation(() => null);

// --------------------------------------------------------------------------
// DANE TESTOWE
// --------------------------------------------------------------------------
const mockTripsData = [
  {
    id: 'trip-past',
    title: 'Rzym Lato 2023',
    origin: 'Warszawa',
    destination: 'Rzym',
    start_date: '2023-07-12',
    end_date: '2023-07-24',
    user_id: 'test-user-id',
    attractions_data: JSON.stringify({ pool: [] })
  },
  {
    id: 'trip-upcoming',
    title: 'Paryż 2026',
    origin: 'Kraków',
    destination: 'Paryż',
    start_date: '2026-09-01',
    end_date: '2026-09-05',
    user_id: 'test-user-id',
    attractions_data: JSON.stringify({ pool: [], selected: ['Panteon'] })
  }
];

// --------------------------------------------------------------------------
// SUITY TESTOWE
// --------------------------------------------------------------------------

describe('Aplikacja Destivo - Kompleksowe Testy Osi Czasu i Listy Podróży', () => {

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_CURRENT_DATE);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { id: 'test-user-id', email: 'test@destivo.io', isGuest: false };
    mockAuthState.isGuest = false;
    globalThis.fetch = mockFetch as any;
    mockFetch.mockClear();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('nominatim')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '48.85', lon: '2.35' }],
        });
      }
      if (url.includes('googleapis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              { place_id: 'g1', name: 'Koloseum', photos: [{ photo_reference: 'ref1' }] }
            ]
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  describe('1. Ekran Listy Podróży (TripsListScreen)', () => {
    test('powinien poprawnie podzielić wycieczki na Nadchodzące i Archiwalne oraz wyliczyć statystyki', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: mockTripsData } });
      mockSupabaseSelect.mockImplementationOnce(() => ({
        eq: jest.fn().mockImplementationOnce(() => ({
          order: jest.fn().mockResolvedValueOnce({ data: mockTripsData, error: null }),
          then: (resolve: any) => resolve({ data: mockTripsData, error: null })
        })),
        order: jest.fn().mockImplementationOnce(() => ({
          limit: jest.fn().mockResolvedValueOnce({ data: mockTripsData, error: null }),
          then: (resolve: any) => resolve({ data: mockTripsData, error: null })
        })),
        then: (resolve: any) => resolve({ data: mockTripsData, error: null })
      }));

      render(<TripsListScreen navigation={{ navigate: mockNavigate }} />);

      await waitFor(() => {
        expect(screen.getByText('Paryż 2026')).toBeTruthy();
        expect(screen.queryByText('Rzym Lato 2023')).toBeNull();
      });

      fireEvent.press(screen.getByText('Archiwalne'));

      await waitFor(() => {
        expect(screen.getByText('Rzym Lato 2023')).toBeTruthy();
        expect(screen.getByText('Archiwalne Wspomnienia')).toBeTruthy();
        expect(screen.getByText('ODWIEDZONYCH MIEJSC')).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
        expect(screen.getByText('12')).toBeTruthy();
      });
    });
  });

  describe('2. Zapis Podróży - QuickSetupScreen i Step4AttractionsScreen', () => {
    test('QuickSetupScreen powinien poprawnie zapisać podróż i zbudować rezerwową pulę', async () => {
      const mockRoute = {
        params: {
          destData: {
            city: 'Madryt',
            recommendedTransport: 'flight',
            coverImage: 'madrid_cover.jpg',
            proposedTrip: {
              startDate: '01-10-2026',
              endDate: '05-10-2026',
              itinerary: [{ attractions: ['Prado', 'Retiro'] }]
            }
          }
        }
      };

      render(<QuickSetupScreen route={mockRoute} navigation={{ navigate: mockNavigate }} />);
      
      fireEvent.press(screen.getByText('Zapisz i zakończ'));

      await waitFor(() => {
        expect(mockDbExecute).toHaveBeenCalled();
        const callArgs = mockDbExecute.mock.calls[0][1];
        const attractionsJsonString = callArgs[9];
        const attractionsData = JSON.parse(attractionsJsonString);
        
        expect(attractionsData.selected).toContain('Prado');
        expect(attractionsData.pool[0].imageUrl).toBe('madrid_cover.jpg');
        expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Trips' });
      });
    });

    test('Step4AttractionsScreen powinien poprawnie zakończyć pełne planowanie', async () => {
      render(<Step4AttractionsScreen />);
      
      fireEvent.press(screen.getByText('Zapisz podróż'));

      await waitFor(() => {
        expect(mockDbExecute).toHaveBeenCalled();
        expect(mockResetTrip).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Trips' });
      });
    });

    test('QuickSetupScreen powinien zablokować zapis wycieczki dla gościa, jeśli ten ma już zapisaną podróż', async () => {
      mockAuthState.user = { id: 'guest-session', email: 'guest@destivo.io', isGuest: true };
      mockAuthState.isGuest = true;
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: [{ id: 'existing-trip' }] } });

      const mockRoute = {
        params: {
          destData: {
            city: 'Madryt',
            recommendedTransport: 'flight',
            coverImage: 'madrid_cover.jpg',
            proposedTrip: {
              startDate: '01-10-2026',
              endDate: '05-10-2026',
              itinerary: [{ attractions: ['Prado', 'Retiro'] }]
            }
          }
        }
      };

      render(<QuickSetupScreen route={mockRoute} navigation={{ navigate: mockNavigate }} />);
      
      fireEvent.press(screen.getByText('Zapisz i zakończ'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('DESTIVO', 'Gość może mieć tylko jedną podróż.');
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });
  });

  describe('3. Oś Czasu i CRUD (TimelineScreen)', () => {
    beforeEach(() => {
      const specificTripData = [{
        id: 'trip-upcoming',
        title: 'Paryż 2026',
        origin: 'Kraków',
        destination: 'Paryż',
        start_date: '2026-09-01',
        end_date: '2026-09-05',
        user_id: 'test-user-id',
        accommodation_address: 'Hotel Paris',
        attractions_data: JSON.stringify({ 
          selected: ['Panteon'], 
          pool: [
            { id: 'p1', name: 'Panteon', imageUrl: 'url' }
          ] 
        })
      }];

      mockSupabaseSelect.mockImplementation(() => ({
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({ data: specificTripData, error: null }),
          order: jest.fn().mockImplementation(() => ({
            limit: jest.fn().mockResolvedValue({ data: specificTripData, error: null }),
          })),
          then: (resolve: any) => resolve({ data: specificTripData, error: null })
        })),
        order: jest.fn().mockImplementation(() => ({
          limit: jest.fn().mockResolvedValue({ data: specificTripData, error: null }),
        })),
        then: (resolve: any) => resolve({ data: specificTripData, error: null })
      }));

      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => [{ lat: '48.85', lon: '2.35' }],
      });
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          results: [
            { place_id: 'g1', name: 'Wieża Eiffla', photos: [{ photo_reference: 'ref1' }] }
          ]
        }),
      });
    });

    test('Powinien wyrenderować wygenerowaną oś z logistyką i otworzyć modal z danymi z Google', async () => {
      render(<TimelineScreen route={{ params: { tripId: 'trip-upcoming' } }} />);

      await waitFor(() => {
        expect(screen.getByText(/Rozpoczęcie podróży/i)).toBeTruthy();
        expect(screen.getByText(/Zakończenie podróży/i)).toBeTruthy();
        expect(screen.getByText('Panteon')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('+'));

      await waitFor(() => {
        expect(screen.getByText('Propozycje z okolicy')).toBeTruthy();
        expect(screen.getByText('Kliknij, aby błyskawicznie dodać do planu.')).toBeTruthy();
      });
    });

    test('Powinien pozwolić na ręczne dodanie wydarzenia do osi', async () => {
      render(<TimelineScreen route={{ params: { tripId: 'trip-upcoming' } }} />);

      await waitFor(() => expect(screen.getByText(/Zakończenie podróży/i)).toBeTruthy());

      fireEvent.press(screen.getByText('+'));
      
      fireEvent.changeText(screen.getByPlaceholderText('np. Obiad w restauracji'), 'Pyszna Pizza');
      fireEvent.changeText(screen.getByPlaceholderText('15-08-2026'), '02-09-2026');
      fireEvent.changeText(screen.getByPlaceholderText('12:00'), '15:00');
      
      fireEvent.press(screen.getByText('DODAJ'));

      await waitFor(() => {
        expect(screen.getByText('Pyszna Pizza')).toBeTruthy();
        expect(screen.getByText('15:00')).toBeTruthy();
      });
    });

    test('Powinien usunąć element po potwierdzeniu w Alercie', async () => {
      render(<TimelineScreen route={{ params: { tripId: 'trip-upcoming' } }} />);

      await waitFor(() => expect(screen.getByText('Panteon')).toBeTruthy());

      fireEvent.press(findPressableAncestor(screen.getByText('Panteon')));

      const deleteButton = await screen.findByText('Usuń');
      fireEvent.press(deleteButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        "Usuń punkt",
        "Czy na pewno chcesz usunąć ten element z osi czasu?",
        expect.any(Array)
      );
    });

    test('Przesunięcie elementu i Zapis układu', async () => {
      render(<TimelineScreen route={{ params: { tripId: 'trip-upcoming' } }} />);

      await waitFor(() => expect(screen.getByText('Panteon')).toBeTruthy());

      fireEvent.press(findPressableAncestor(screen.getByText('Panteon')));
      fireEvent.press(screen.getByText('🔼'));

      await waitFor(() => {
        expect(screen.getByText('Zapisz układ osi czasu')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Zapisz układ osi czasu'));

      await waitFor(() => {
        expect(mockSupabaseUpdate).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith("Sukces", "Oś czasu została zaktualizowana.");
      });
    });

    test('archiwalna podróż nie pokazuje oznaczenia TERAZ / NASTĘPNE', async () => {
      const archivedTrip = [{
        id: 'trip-archived',
        title: 'Rzym 2023',
        origin: 'Warszawa',
        destination: 'Rzym',
        start_date: '2023-07-12',
        end_date: '2023-07-24',
        user_id: 'test-user-id',
        accommodation_address: 'Hotel Roma',
        attractions_data: JSON.stringify({ selected: ['Koloseum'], pool: [] }),
      }];

      mockSupabaseSelect.mockImplementationOnce(() => ({
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({ data: archivedTrip, error: null }),
          order: jest.fn(),
          then: (resolve: any) => resolve({ data: archivedTrip, error: null }),
        })),
        order: jest.fn(),
        then: (resolve: any) => resolve({ data: archivedTrip, error: null }),
      }));

      render(<TimelineScreen route={{ params: { tripId: 'trip-archived' } }} />);

      await waitFor(() => {
        expect(screen.getByText(/Rozpoczęcie podróży/i)).toBeTruthy();
      });
      expect(screen.queryByText('TERAZ / NASTĘPNE')).toBeNull();
    });

    test('gość usuwa podróż przez lokalny PowerSync bez użycia Supabase', async () => {
      mockAuthState.user = { id: 'guest-session', email: 'guest@destivo.io', isGuest: true };
      mockAuthState.isGuest = true;
      const guestTrip = [{
        id: 'guest-trip',
        user_id: 'guest-session',
        trip_name: 'Rzym',
        origin: 'Warszawa',
        destination: 'Rzym',
        start_date: '2027-08-10',
        end_date: '2027-08-20',
        transport_data: '{}',
        lodging_data: '{}',
        attractions_data: JSON.stringify({ selected: [], pool: [] }),
        created_at: '2026-09-03T10:00:00.000Z',
      }];
      mockDbExecute
        .mockResolvedValueOnce({ rows: { _array: guestTrip } })
        .mockResolvedValueOnce({ rows: [] });

      render(<TimelineScreen route={{ params: { tripId: 'guest-trip' } }} />);

      await waitFor(() => expect(screen.getByText('Rzym')).toBeTruthy());
      fireEvent.press(screen.getByText('🗑️'));

      const alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
      const confirmAction = alertCall[2].find((action: any) => action.text === 'Usuń podróż');
      await confirmAction.onPress();

      expect(mockDbExecute).toHaveBeenCalledWith(
        'DELETE FROM trips WHERE id = ?',
        ['guest-trip']
      );
      expect(mockSupabaseDelete).not.toHaveBeenCalled();
    });

    test('Powinien wyrenderować szufladkę sejfu dla podróży i nawigować do Vault po kliknięciu', async () => {
      render(<TimelineScreen route={{ params: { tripId: 'trip-upcoming' } }} />);

      await waitFor(() => {
        expect(screen.getByText('Szufladka Sejfu')).toBeTruthy();
        expect(screen.getByText('Brak plików w szufladce')).toBeTruthy();
        expect(screen.getByText('Otwórz Sejf ➔')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Szufladka Sejfu'));

      expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
        screen: 'Vault',
        params: { tripId: 'trip-upcoming' },
      });
    });

    test('Powinien wyświetlić liczbę zabezpieczonych plików w szufladce sejfu, gdy lodging_data zawiera pliki', async () => {
      const tripWithVaultFiles = [{
        id: 'trip-vault-demo',
        title: 'Paryż 2026',
        origin: 'Kraków',
        destination: 'Paryż',
        start_date: '2026-09-01',
        end_date: '2026-09-05',
        user_id: 'test-user-id',
        accommodation_address: 'Hotel Paris',
        lodging_data: JSON.stringify({
          lodgingAddress: 'Hotel Paris',
          vaultFiles: [
            { id: 'f1', name: 'ticket.pdf' },
            { id: 'f2', name: 'hotel_booking.pdf' },
          ],
        }),
        attractions_data: JSON.stringify({ selected: [], pool: [] }),
      }];

      mockSupabaseSelect.mockImplementationOnce(() => ({
        eq: jest.fn().mockImplementationOnce(() => ({
          eq: jest.fn().mockResolvedValueOnce({ data: tripWithVaultFiles, error: null }),
          order: jest.fn().mockImplementationOnce(() => ({
            limit: jest.fn().mockResolvedValueOnce({ data: tripWithVaultFiles, error: null }),
          })),
          then: (resolve: any) => resolve({ data: tripWithVaultFiles, error: null }),
        })),
        order: jest.fn().mockImplementationOnce(() => ({
          limit: jest.fn().mockResolvedValueOnce({ data: tripWithVaultFiles, error: null }),
        })),
        then: (resolve: any) => resolve({ data: tripWithVaultFiles, error: null }),
      }));

      render(<TimelineScreen route={{ params: { tripId: 'trip-vault-demo' } }} />);

      await waitFor(() => {
        expect(screen.getByText('Szufladka Sejfu')).toBeTruthy();
        expect(screen.getByText('2 zabezpieczonych plików')).toBeTruthy();
      });
    });
  });
});