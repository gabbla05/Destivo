/// <reference types="jest" />
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { printToFileAsync } from 'expo-print';

// Ekrany i komponenty biorące udział w ścieżkach E2E
import { HomeScreen } from '../src/screens/HomeScreen';
import { ExploreDetailsScreen } from '../src/screens/ExploreDetailsScreen';
import { QuickSetupScreen } from '../src/screens/QuickSetupScreen';
import { Step1DestinationScreen } from '../src/screens/TripCreator/Step1DestinationScreen';
import { Step4AttractionsScreen } from '../src/screens/TripCreator/Step4AttractionsScreen';
import { TripsListScreen } from '../src/screens/TripsListScreen';
import { RouteOptimizationModal } from '../src/components/RouteOptimizationModal';
import { SmartPackingModal } from '../src/components/SmartPackingModal';
import { QuickTicketPassModal } from '../src/components/QuickTicketPassModal';
import { VaultPinScreen } from '../src/screens/Vault/VaultPinScreen';
import { VaultDashboardScreen } from '../src/screens/Vault/VaultDashboardScreen';

// Store i biblioteki
import { useAuthStore } from '../src/store/authStore';
import { useTripCreatorStore } from '../src/store/tripCreatorStore';
import { useVaultStore } from '../src/store/vaultStore';
import { LiveDestination, generateLiveRecommendations } from '../src/lib/liveExplore';

// ---------------------------------------------------------------------------
// 1. ZARZĄDZANIE STANEM BAZY DANYCH SQLITE (W PEŁNI IZOLOWANE ŚRODOWISKO IN-MEMORY)
// ---------------------------------------------------------------------------
interface DbTrip {
  id: string;
  user_id: string;
  trip_name: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
  transport_data: string;
  lodging_data: string;
  attractions_data: string;
  created_at?: string;
}

let inMemoryDbTrips: DbTrip[] = [];

const mockDbExecute = jest.fn().mockImplementation(async (sql: string, params: any[] = []) => {
  const norm = sql.trim().toUpperCase();

  if (norm.startsWith('INSERT INTO TRIPS') || norm.startsWith('INSERT OR REPLACE INTO TRIPS')) {
    const newTrip: DbTrip = {
      id: params[0] || 'trip_' + Date.now(),
      user_id: params[1] || 'user-e2e-1',
      trip_name: params[2] || '',
      origin: params[3] || '',
      destination: params[4] || '',
      start_date: params[5] || '',
      end_date: params[6] || '',
      transport_data: params[7] || '{}',
      lodging_data: params[8] || '{}',
      attractions_data: params[9] || '{}',
      created_at: new Date().toISOString(),
    };
    inMemoryDbTrips = inMemoryDbTrips.filter((t) => t.id !== newTrip.id);
    inMemoryDbTrips.push(newTrip);
    return { rows: [newTrip], array: [newTrip] };
  }

  if (norm.startsWith('UPDATE TRIPS')) {
    if (sql.includes('attractions_data = ?')) {
      const attractionsData = params[0];
      const tripId = params[1];
      const found = inMemoryDbTrips.find((t) => t.id === tripId);
      if (found) {
        found.attractions_data = attractionsData;
      }
    }
    return { rows: [], array: [] };
  }

  if (norm.startsWith('SELECT 1 FROM TRIPS')) {
    const userId = params[0];
    const filtered = inMemoryDbTrips.filter((t) => !userId || t.user_id === userId || (userId === 'guest' && ['guest', 'guest-session'].includes(t.user_id)));
    return { rows: filtered.slice(0, 1), array: filtered.slice(0, 1) };
  }

  if (norm.startsWith('DELETE FROM TRIPS')) {
    const tripId = params[0];
    inMemoryDbTrips = inMemoryDbTrips.filter((t) => t.id !== tripId);
    return { rows: [], array: [] };
  }

  if (norm.includes('FROM TRIPS WHERE USER_ID =') || norm.includes('FROM TRIPS WHERE')) {
    const userId = params[0];
    const filtered = inMemoryDbTrips.filter((t) => !userId || t.user_id === userId || (t.user_id && ['guest', 'guest-session'].includes(t.user_id)));
    return { rows: filtered, array: filtered };
  }

  return { rows: inMemoryDbTrips, array: inMemoryDbTrips };
});

jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

// Mock nawigacji i focusu
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        return cb();
      }, [cb]);
    },
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      reset: jest.fn(),
    }),
  };
});

// Mock zoptymalizowanych rekomendacji LiveExplore
jest.mock('../src/lib/liveExplore', () => {
  const actual = jest.requireActual('../src/lib/liveExplore');
  return {
    ...actual,
    generateLiveRecommendations: jest.fn(),
  };
});

// Mock Supabase
jest.mock('../src/lib/supabase', () => {
  const queryBuilder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
    insert: jest.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
    upsert: jest.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: jest.fn(() => queryBuilder),
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    },
  };
});

jest.mock('expo-brightness', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  getBrightnessAsync: jest.fn().mockResolvedValue(0.5),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
  restoreSystemBrightnessAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => `mock-e2e-uuid-${Math.random().toString(36).substring(2, 9)}`,
}));

describe('Destivo E2E - Krytyczne Ścieżki Biznesowe (Google Testing Pyramid)', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  };

  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
  const future = new Date(Date.now() + 3 * 86400000);
  const futureFormatted = `${String(future.getDate()).padStart(2, '0')}-${String(future.getMonth() + 1).padStart(2, '0')}-${future.getFullYear()}`;

  const mockPredefinedRome: LiveDestination = {
    id: 'rome_e2e_01',
    city: 'Rzym',
    country: 'Włochy',
    lat: 41.9028,
    lon: 12.4964,
    coverImage: 'https://images.unsplash.com/photo-rome.jpg',
    shortDescription: 'Wieczne miasto z bogatą historią.',
    transportCode: 'ROM',
    distanceKm: 1300,
    recommendedTransport: 'flight',
    nearestAirport: 'WAW',
    flightDate: `${todayFormatted} - ${futureFormatted}`,
    hasPredefinedPlan: true,
    proposedTrip: {
      startDate: todayFormatted,
      endDate: futureFormatted,
      durationDays: 3,
      estimatedTemp: 23,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      crowdLevel: 'Umiarkowany ruch',
      itinerary: [
        { day: 1, title: 'Dzień 1', attractions: ['Koloseum', 'Panteon'] },
        { day: 2, title: 'Dzień 2', attractions: ['Watykan'] },
      ],
    },
  };

  const mockDayTripKazimierz: LiveDestination = {
    id: 'kazimierz_e2e_01',
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
      startDate: todayFormatted,
      endDate: todayFormatted,
      durationDays: 1,
      estimatedTemp: 21,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      crowdLevel: 'Spokojnie',
      itinerary: [
        { day: 1, title: 'Dzień 1', attractions: ['Rynek w Kazimierzu Dolnym', 'Góra Trzech Krzyży'] },
      ],
    },
  };

  beforeEach(async () => {
    // Całkowita izolacja danych przed każdym testem (zero leaków między testami)
    inMemoryDbTrips = [];
    jest.clearAllMocks();
    await AsyncStorage.clear();

    useAuthStore.setState({
      user: { id: 'user-e2e-1', name: 'Alicja', email: 'alicja@destivo.app', isGuest: false },
      isGuest: false,
      language: 'pl',
    });

    useTripCreatorStore.getState().reset();
    useVaultStore.setState({
      pin: null,
      isUnlocked: false,
      isBiometricsEnabled: false,
    });

    (generateLiveRecommendations as jest.Mock).mockResolvedValue([
      mockPredefinedRome,
      mockDayTripKazimierz,
    ]);
  });

  // =========================================================================
  // ŚCIEŻKA 1: Błyskawiczna inspiracja Explore ➔ Szczegóły ➔ QuickSetup ➔ Aktywny dzień
  // =========================================================================
  test('E2E Ścieżka 1: Użytkownik wybiera podróż z gotowym planem, konfiguruje ją i zarządza aktywnym dniem', async () => {
    // 1. Ekran Główny: Użytkownik przegląda rekomendacje i widzi gotowy plan do Rzymu
    const { unmount: unmountHome } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
      expect(screen.getByText(/3-dniowy gotowy plan wycieczki/i)).toBeTruthy();
    });

    // 2. Kliknięcie kafelka Rzymu ➔ przekierowanie do ExploreDetails
    fireEvent.press(screen.getByText('Rzym'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ExploreDetails', {
      destData: mockPredefinedRome,
    });
    unmountHome();

    // 3. Ekran Szczegółów (ExploreDetails): Weryfikacja harmonogramu i kliknięcie wyboru podróży
    const { unmount: unmountDetails } = render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockPredefinedRome } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText('Koloseum')).toBeTruthy();
    expect(screen.getByText('Panteon')).toBeTruthy();
    expect(screen.getByText(/Wybieram tę podróż!/i)).toBeTruthy();

    fireEvent.press(screen.getByText(/Wybieram tę podróż!/i));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QuickSetup', {
      destData: mockPredefinedRome,
    });
    unmountDetails();

    // 4. Ekran Szybkiej Konfiguracji (QuickSetup): Uzupełnienie danych wylotu i noclegu
    const { unmount: unmountQuick } = render(
      <QuickSetupScreen
        route={{ params: { destData: mockPredefinedRome } }}
        navigation={mockNavigation}
      />
    );

    fireEvent.changeText(screen.getByPlaceholderText(/np\. Warszawa/i), 'Warszawa');
    fireEvent.changeText(screen.getByPlaceholderText(/Wklej adres\.\.\./i), 'Hotel Colosseo, Via dei Fori');

    // 5. Zapis wycieczki: Baza danych SQLite rejestruje nowy rekord z osią czasu
    fireEvent.press(screen.getByText(/Zapisz i zakończ/i));

    await waitFor(() => {
      expect(inMemoryDbTrips.length).toBe(1);
      expect(inMemoryDbTrips[0].destination).toBe('Rzym');
      expect(inMemoryDbTrips[0].trip_name).toBe('Rzym');
      
      const attractionsData = JSON.parse(inMemoryDbTrips[0].attractions_data);
      expect(attractionsData.customTimeline.length).toBeGreaterThanOrEqual(4);
    });
    unmountQuick();

    // 6. Powrót na Ekran Główny: System wykrywa trwający wyjazd i przełącza się w tryb Aktywnej Podróży
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      // Widok aktywnej podróży
      expect(screen.getByText(/Podróż do Rzym/i)).toBeTruthy();
      expect(screen.getByText('W TRAKCIE')).toBeTruthy();
      // Narzędzia podróżne: Kalkulator walut i numery alarmowe
      expect(screen.getByText(/Kalkulator Walut/i)).toBeTruthy();
      expect(screen.getByText(/Lokalny numer alarmowy/i)).toBeTruthy();
    });

    if (screen.queryByTestId('toggle-past-events-btn')) {
      fireEvent.press(screen.getByTestId('toggle-past-events-btn'));
    }
    expect(screen.getByText('Koloseum')).toBeTruthy();
  });

  // =========================================================================
  // ŚCIEŻKA 2: Jednodniowy wypad autem bez noclegu (Road Trip Same-Day)
  // =========================================================================
  test('E2E Ścieżka 2: Jednodniowy wypad autem filtruje opcje, wyklucza noclegi i generuje plan 1-dniowy', async () => {
    // 1. Ekran Główny: Użytkownik klika filtr 1-dniowych wypadów autem
    const { unmount: unmountHome } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Kazimierz Dolny')).toBeTruthy();
    });

    fireEvent.press(screen.getByText(/1 dzień \(autem\)/i));
    expect(screen.getByText('Kazimierz Dolny')).toBeTruthy();
    expect(screen.queryByText('Rzym')).toBeNull();

    // 2. Przejście do szczegółów jednodniówki
    fireEvent.press(screen.getByText('Kazimierz Dolny'));
    unmountHome();

    // 3. Ekran Szczegółów: Zamiast rezerwacji hotelu jest przycisk "Gdzie zjeść na trasie"
    const { unmount: unmountDetails } = render(
      <ExploreDetailsScreen
        route={{ params: { destData: mockDayTripKazimierz } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText(/Jednodniowy wypad bez noclegu/i)).toBeTruthy();
    expect(screen.getByText(/Gdzie zjeść na trasie/i)).toBeTruthy();
    expect(screen.queryByText(/Noclegi/i)).toBeNull();

    fireEvent.press(screen.getByText(/Wybieram tę podróż!/i));
    unmountDetails();

    // 4. QuickSetup: Data powrotu zablokowana do tego samego dnia, brak wymogu noclegu
    const { unmount: unmountQuick } = render(
      <QuickSetupScreen
        route={{ params: { destData: mockDayTripKazimierz } }}
        navigation={mockNavigation}
      />
    );

    expect(screen.getByText(/Ten sam dzień/i)).toBeTruthy();
    expect(screen.getByText(/ADRES \/ PRZYSTANEK \(Opcjonalnie - brak noclegu\)/i)).toBeTruthy();

    fireEvent.press(screen.getByText(/Zapisz i zakończ/i));

    await waitFor(() => {
      expect(inMemoryDbTrips.length).toBe(1);
      const trip = inMemoryDbTrips[0];
      expect(trip.start_date).toBe(trip.end_date); // Ten sam dzień

      const timeline = JSON.parse(trip.attractions_data).customTimeline;
      // Weryfikacja biznesowa: ZERO noclegów o 22:00, brak hotelowego check-in
      const lodgingEvents = timeline.filter((e: any) => e.type === 'LODGING');
      expect(lodgingEvents.length).toBe(0);

      // Punkty trasy
      expect(timeline.some((e: any) => e.type === 'DEPARTURE')).toBe(true);
      expect(timeline.some((e: any) => e.type === 'RETURN')).toBe(true);
    });
    unmountQuick();
  });

  // =========================================================================
  // ŚCIEŻKA 3: Pełny kreator podróży od podstaw ➔ Zapis do SQLite ➔ TripsListScreen
  // =========================================================================
  test('E2E Ścieżka 3: Użytkownik planuje podróż od zera w TripCreatorze i weryfikuje ją na liście podróży', async () => {
    // 1. Krok 1 Kreatora: Wpisanie destynacji i terminów
    const { unmount: unmountStep1 } = render(
      <Step1DestinationScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(screen.getByPlaceholderText(/np\. Warszawa/i), 'Kraków');
    fireEvent.changeText(screen.getByPlaceholderText(/np\. Rzym/i), 'Barcelona');
    fireEvent.changeText(screen.getByPlaceholderText(/np\. Wakacje we Włoszech/i), 'Wyprawa do Barcelony');
    const dateInputs = screen.getAllByPlaceholderText(/DD-MM-YYYY/i);
    fireEvent.changeText(dateInputs[0], todayFormatted);
    fireEvent.changeText(dateInputs[1], futureFormatted);
    
    fireEvent.press(screen.getByText('Dalej'));

    await waitFor(() => {
      // Sprawdzamy zapis stanu w store
      expect(useTripCreatorStore.getState().destination).toBe('Barcelona');
      expect(useTripCreatorStore.getState().tripName).toBe('Wyprawa do Barcelony');
    });
    unmountStep1();

    // 2. Krok 2 & 3: Zapis transportu i hotelu w store
    useTripCreatorStore.getState().setTransportOption({
      id: 'flight_1',
      type: 'flight',
      provider: 'LOT',
      rawDurationMinutes: 180,
      doorToDoorDurationMinutes: 240,
      basePrice: 450,
      totalCost: 450,
      minTotalCost: 450,
      maxTotalCost: 450,
      price: { min: 450, max: 450, currency: 'PLN', status: 'LIVE', source: 'Skyscanner' },
      dataConfidence: 'HIGH',
      distanceKm: 1800,
      stressScore: 10,
      badges: ['SMART_CHOICE'],
    });
    useTripCreatorStore.getState().setLodgingAddress('Hotel Sagrada, Barcelona');

    // 3. Krok 4: Wybór atrakcji i finalny zapis wycieczki
    useTripCreatorStore.getState().toggleAttraction('Sagrada Familia');
    useTripCreatorStore.getState().toggleAttraction('Park Güell');

    const { unmount: unmountStep4 } = render(
      <Step4AttractionsScreen />
    );

    const finishBtn = screen.getByText(/Zapisz podróż/i);
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(inMemoryDbTrips.length).toBe(1);
      expect(inMemoryDbTrips[0].destination).toBe('Barcelona');
      expect(inMemoryDbTrips[0].trip_name).toBe('Wyprawa do Barcelony');
    });
    unmountStep4();

    // 4. Ekran Listy Podróży (TripsListScreen): Wczytanie z bazy SQLite
    const { unmount: unmountTripsList } = render(<TripsListScreen navigation={mockNavigation as any} />);

    await waitFor(() => {
      expect(screen.getAllByText('Wyprawa do Barcelony').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Barcelona/i).length).toBeGreaterThanOrEqual(1);
    });

    // 5. Pełny cykl życia (CRUD): Usunięcie podróży z potwierdzeniem w oknie modalnym Alert
    const tripId = inMemoryDbTrips[0].id;
    const deleteBtn = screen.getByTestId(`trip-delete-btn-${tripId}`);
    const alertSpy = jest.spyOn(Alert, 'alert');

    fireEvent.press(deleteBtn);

    expect(alertSpy).toHaveBeenCalled();
    const lastAlertCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const buttons = lastAlertCall[2];
    const confirmDeleteBtn = buttons?.find((b: any) => b.style === 'destructive' || b.text?.includes('Usuń'));
    expect(confirmDeleteBtn).toBeDefined();

    // Użytkownik potwierdza usunięcie
    await act(async () => {
      await confirmDeleteBtn!.onPress!();
    });

    // Weryfikacja: usunięto kaskadowo z bazy SQLite oraz zniknęło z UI
    await waitFor(() => {
      expect(inMemoryDbTrips.length).toBe(0);
      expect(screen.queryByText('Wyprawa do Barcelony')).toBeNull();
    });
    unmountTripsList();
  });

  // =========================================================================
  // ŚCIEŻKA 4: Interaktywna oś czasu, optymalizacja trasy TSP i asystent pakowania
  // =========================================================================
  test('E2E Ścieżka 4: Użytkownik dodaje atrakcję na osi, optymalizuje trasę TSP i odhacza pakowanie', async () => {
    // 1. Przygotowanie aktywnej wycieczki w bazie SQLite
    const activeTripId = 'active_e2e_trip';
    const initialEvents = [
      { id: 'ev_1', type: 'ATTRACTION', title: 'Watykan', timeStr: '10:00', dateStr: todayFormatted, subtitle: 'Zwiedzanie', parsedDate: new Date() },
      { id: 'ev_2', type: 'ATTRACTION', title: 'Koloseum', timeStr: '14:00', dateStr: todayFormatted, subtitle: 'Zwiedzanie', parsedDate: new Date() },
      { id: 'ev_3', type: 'ATTRACTION', title: 'Panteon', timeStr: '17:00', dateStr: todayFormatted, subtitle: 'Zwiedzanie', parsedDate: new Date() },
    ];

    inMemoryDbTrips.push({
      id: activeTripId,
      user_id: 'user-e2e-1',
      trip_name: 'Aktywny Rzym',
      origin: 'Warszawa',
      destination: 'Rzym',
      start_date: todayFormatted,
      end_date: futureFormatted,
      transport_data: JSON.stringify({ selectedOption: { type: 'flight' } }),
      lodging_data: JSON.stringify({ lodgingAddress: 'Via Nazionale 12' }),
      attractions_data: JSON.stringify({ customTimeline: initialEvents, pool: [] }),
    });

    // 2. Ekran Główny w trybie aktywnej podróży
    const { unmount: unmountHome } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Podróż do Rzym/i)).toBeTruthy();
      expect(screen.getByText('Dodaj atrakcję')).toBeTruthy();
    });

    // 3. Dodanie nowego punktu na osi czasu
    fireEvent.press(screen.getByText('Dodaj atrakcję'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/np\. Obiad w restauracji/i)).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText(/np\. Obiad w restauracji/i), 'Fontanna di Trevi');
    fireEvent.press(screen.getByText(/Dodaj do planu/i));

    // Weryfikacja zapisu w bazie danych
    await waitFor(() => {
      const updatedData = JSON.parse(inMemoryDbTrips[0].attractions_data);
      expect(updatedData.customTimeline.some((e: any) => e.title === 'Fontanna di Trevi')).toBe(true);
    });
    unmountHome();

    // 4. Optymalizacja trasy (TSP Route Optimization)
    const onApplyMock = jest.fn((optimizedEvents) => {
      inMemoryDbTrips[0].attractions_data = JSON.stringify({ customTimeline: optimizedEvents });
    });

    const { unmount: unmountOpt } = render(
      <RouteOptimizationModal
        visible={true}
        onClose={jest.fn()}
        onApply={onApplyMock}
        events={initialEvents}
        destinationCity="Rzym"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Zapisz kolejność')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Zapisz kolejność'));
    expect(onApplyMock).toHaveBeenCalledTimes(1);
    unmountOpt();

    // 5. Inteligentny Asystent Pakowania (Smart Packing Assistant)
    render(
      <SmartPackingModal
        visible={true}
        onClose={jest.fn()}
        tripId={activeTripId}
        destination="Rzym"
        startDate={todayFormatted}
        endDate={futureFormatted}
        transportType="flight"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Dynamiczny Asystent Pakowania/i)).toBeTruthy();
      // Reguły biznesowe: dla lotu sprawdzamy limit płynów
      expect(screen.getByText('Płyny w buteleczkach do 100 ml')).toBeTruthy();
    });

    // Odznaczenie przedmiotu jako spakowany
    const checkItem = screen.getByTestId('packing-item-check-flight-liquids');
    fireEvent.press(checkItem);

    // Sprawdzenie persystencji w AsyncStorage
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(`destivo_packing_list_${activeTripId}`);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored || '{}');
      const item = parsed.items?.find((i: any) => i.id === 'flight-liquids');
      expect(item?.checked).toBe(true);
    });
  });

  // =========================================================================
  // ŚCIEŻKA 5: Bezpieczny Sejf (Vault): PIN ➔ Odblokowanie ➔ Briefing PDF
  // =========================================================================
  test('E2E Ścieżka 5: Konfiguracja PIN-u sejfu, odblokowanie i generowanie raportu podróży PDF', async () => {
    // 1. Sejf początkowo zablokowany bez PIN-u
    expect(useVaultStore.getState().pin).toBeNull();
    expect(useVaultStore.getState().isUnlocked).toBe(false);

    // 2. Pierwsze wejście: Ustawienie 4-cyfrowego PIN-u (1-2-3-4)
    const { unmount: unmountPin } = render(<VaultPinScreen />);

    expect(screen.getByText('Utwórz kod PIN')).toBeTruthy();

    // Wprowadzenie PIN-u: 1, 2, 3, 4
    fireEvent.press(screen.getByText('1'));
    fireEvent.press(screen.getByText('2'));
    fireEvent.press(screen.getByText('3'));
    fireEvent.press(screen.getByText('4'));

    // Potwierdzenie PIN-u: 1, 2, 3, 4
    await waitFor(() => {
      expect(screen.getByText('Potwierdź kod PIN')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('1'));
    fireEvent.press(screen.getByText('2'));
    fireEvent.press(screen.getByText('3'));
    fireEvent.press(screen.getByText('4'));

    // Weryfikacja: PIN ustawiony, sejf odblokowany
    await waitFor(() => {
      expect(useVaultStore.getState().pin).toBe('1234');
      expect(useVaultStore.getState().isUnlocked).toBe(true);
    });
    unmountPin();

    // 3. Przygotowanie wycieczki z biletem i dokumentami
    const tripWithTicket: DbTrip = {
      id: 'trip_vault_e2e',
      user_id: 'user-e2e-1',
      trip_name: 'Wyprawa do Rzymu',
      origin: 'Warszawa',
      destination: 'Rzym',
      start_date: todayFormatted,
      end_date: futureFormatted,
      transport_data: JSON.stringify({
        selectedOption: { type: 'flight', provider: 'LOT' },
        details: { outboundDepartureTime: '09:00', outboundArrivalTime: '11:30' },
      }),
      lodging_data: JSON.stringify({ lodgingAddress: 'Via del Corso 10' }),
      attractions_data: JSON.stringify({ customTimeline: [{ id: '1', title: 'Koloseum', timeStr: '14:00' }] }),
    };
    inMemoryDbTrips.push(tripWithTicket);

    // 4. Panel Sejfu (VaultDashboardScreen): Dostęp do biletów i generowanie raportu PDF
    render(
      <VaultDashboardScreen
        route={{ params: { tripId: 'trip_vault_e2e' } }}
        navigation={mockNavigation}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Offline Travel Briefing/i)).toBeTruthy();
      expect(screen.getByTestId('generate-briefing-btn')).toBeTruthy();
    });

    // 5. Kliknięcie generowania raportu PDF
    const generatePdfBtn = screen.getByTestId('generate-briefing-btn');
    fireEvent.press(generatePdfBtn);

    await waitFor(() => {
      // Weryfikacja wywołania expo-print z kompletem danych podróży
      expect(printToFileAsync).toHaveBeenCalled();
      const printCall = (printToFileAsync as jest.Mock).mock.calls[0][0];
      expect(printCall.html).toContain('Rzym');
      expect(printCall.html).toContain('Koloseum');
    });
  });

  // =========================================================================
  // ŚCIEŻKA 6: Wykrywanie i blokowanie kolizji terminów wycieczek (Trip Collision Detection)
  // =========================================================================
  test('E2E Ścieżka 6: Wykrywanie i blokowanie kolizji terminów wycieczek (Trip Collision Detection)', async () => {
    // 1. Użytkownik ma już w kalendarzu zapisaną wycieczkę do Grecji (10-10-2026 do 18-10-2026)
    inMemoryDbTrips.push({
      id: 'existing_trip_greece',
      user_id: 'user-e2e-1',
      trip_name: 'Wakacje w Grecji',
      origin: 'Warszawa',
      destination: 'Ateny',
      start_date: '10-10-2026',
      end_date: '18-10-2026',
      transport_data: '{}',
      lodging_data: '{}',
      attractions_data: '{}',
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    // 2. Otwarcie Kroku 1 Kreatora Podróży
    const { unmount } = render(<Step1DestinationScreen navigation={mockNavigation} />);

    // 3. Wpisanie nowej podróży z terminem kolidującym (12-10-2026 do 15-10-2026)
    fireEvent.changeText(screen.getByPlaceholderText(/np\. Warszawa/i), 'Kraków');
    fireEvent.changeText(screen.getByPlaceholderText(/np\. Rzym/i), 'Madryt');
    fireEvent.changeText(screen.getByPlaceholderText(/np\. Wakacje we Włoszech/i), 'Wyjazd do Madrytu');
    const dateInputs = screen.getAllByPlaceholderText(/DD-MM-YYYY/i);
    fireEvent.changeText(dateInputs[0], '12-10-2026');
    fireEvent.changeText(dateInputs[1], '15-10-2026');

    // 4. Kliknięcie "Dalej"
    fireEvent.press(screen.getByText('Dalej'));

    // 5. Weryfikacja: zablokowanie przejścia i wyświetlenie alertu o kolizji
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      expect(lastCall[0]).toBe('DESTIVO');
      expect(lastCall[1]).toContain('Wakacje w Grecji');
    });

    // Przejście do Kroku 2 nie mogło nastąpić
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('Step2Transport');

    // 6. Korekta terminu na niekolidujący (20-10-2026 do 25-10-2026)
    fireEvent.changeText(dateInputs[0], '20-10-2026');
    fireEvent.changeText(dateInputs[1], '25-10-2026');

    fireEvent.press(screen.getByText('Dalej'));

    // 7. Weryfikacja: pomyślna walidacja i przejście do kroku 2 ze zaktualizowanym storem
    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Step2Transport');
      expect(useTripCreatorStore.getState().destination).toBe('Madryt');
      expect(useTripCreatorStore.getState().startDate).toBe('20-10-2026');
      expect(useTripCreatorStore.getState().endDate).toBe('25-10-2026');
    });

    unmount();
  });

  // =========================================================================
  // ŚCIEŻKA 7: Ochrona limitu konta gościa i ścieżka konwersji (Guest Account Limit)
  // =========================================================================
  test('E2E Ścieżka 7: Ochrona limitu konta gościa i ścieżka konwersji (Guest Account Limit)', async () => {
    // 1. Użytkownik jako gość posiadający już 1 zapisaną podróż w SQLite
    useAuthStore.setState({
      user: { id: 'guest', name: 'Gość', email: '', isGuest: true },
      isGuest: true,
      language: 'pl',
    });

    inMemoryDbTrips.push({
      id: 'guest_trip_1',
      user_id: 'guest',
      trip_name: 'Pierwszy wypad gościa',
      origin: 'Warszawa',
      destination: 'Gdańsk',
      start_date: todayFormatted,
      end_date: futureFormatted,
      transport_data: '{}',
      lodging_data: '{}',
      attractions_data: '{}',
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    // 2. Gość próbuje wejść do kreatora nowej wycieczki
    const { unmount } = render(<Step1DestinationScreen navigation={mockNavigation} />);

    // 3. Weryfikacja: natychmiastowe wykrycie przekroczenia limitu 1 podróży dla gościa
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    expect(lastCall[0]).toContain('Limit konta gościa');
    const buttons = lastCall[2];
    expect(buttons).toBeDefined();
    expect(buttons!.length).toBe(3);

    // 4. Kliknięcie opcji przejścia do logowania/rejestracji
    const loginAction = buttons!.find((b: any) => b.text?.includes('Zaloguj') || b.text?.includes('rejestracj'));
    expect(loginAction).toBeDefined();
    act(() => {
      loginAction!.onPress!();
    });

    // Weryfikacja: wywołanie wylogowania gościa (reset sesji dla przejścia do logowania)
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isGuest).toBe(false);

    unmount();
  });

  // =========================================================================
  // ŚCIEŻKA 8: Szybki Bilet Pokładowy (QuickTicketPassModal) i Dostęp Offline
  // =========================================================================
  test('E2E Ścieżka 8: Szybki Bilet Pokładowy prezentuje odjazd na żywo, przełącza trasę powrotną i otwiera sejf', async () => {
    const mockOnOpenVault = jest.fn();
    const mockOnClose = jest.fn();

    // 1. Otwarcie modalu biletu pokładowego z odcinkiem TAM i POWRÓT
    const { unmount } = render(
      <QuickTicketPassModal
        visible={true}
        onClose={mockOnClose}
        ticketFile={{
          id: 'ticket_pdf_01',
          name: 'bilet_pkp.pdf',
          uri: 'file:///data/user/0/destivo/files/bilet_pkp.pdf',
          type: 'application/pdf',
          createdAt: new Date().toISOString(),
        }}
        departureTime="08:30"
        stationName="Warszawa Centralna"
        destination="Gdańsk Główny"
        transportType="train"
        onOpenVault={mockOnOpenVault}
        activeLeg="outbound"
        outboundDepartureTime="08:30"
        returnDepartureTime="19:45"
        outboundStation="Warszawa Centralna"
        returnStation="Gdańsk Główny"
      />
    );

    // 2. Weryfikacja odcinka TAM: stacja początkowa, docelowa, godzina odjazdu i gotowość do kontroli
    expect(screen.getByText('Warszawa Centralna')).toBeTruthy();
    expect(screen.getByText('Gdańsk Główny')).toBeTruthy();
    expect(screen.getByText('08:30')).toBeTruthy();
    expect(screen.getByText(/GOTOWY DO OKAZANIA/i)).toBeTruthy();

    // 3. Przełączenie na odcinek POWRÓT
    const returnLegBtn = screen.getByTestId('quick-pass-leg-return-btn');
    fireEvent.press(returnLegBtn);

    // 4. Weryfikacja odcinka POWRÓT: zaktualizowana godzina powrotu
    await waitFor(() => {
      expect(screen.getByText('19:45')).toBeTruthy();
    });

    // 5. Przejście bezpośrednio do Bezpiecznego Sejfu dokumentów
    const gotoVaultBtn = screen.getByTestId('quick-pass-goto-vault-btn');
    fireEvent.press(gotoVaultBtn);

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnOpenVault).toHaveBeenCalled();

    unmount();
  });
});
