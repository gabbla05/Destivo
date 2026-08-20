/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Step4AttractionsScreen } from '../src/screens/TripCreator/Step4AttractionsScreen';

// 1. MOCKOWANIE ZUSTAND - AUTH STORE
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user-123' },
    language: 'pl',
  }),
}));

// 2. MOCKOWANIE ZUSTAND - TRIP CREATOR STORE
const mockToggleAttraction = jest.fn();
const mockReset = jest.fn();
jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: () => ({
    tripName: 'Wakacje w Rzymie',
    origin: 'Warszawa',
    destination: 'Rzym',
    startDate: '10-08-2027',
    endDate: '20-08-2027',
    transport: { selectedOption: { id: 'flight-1' } },
    transportDetails: {},
    lodging: {},
    lodgingAddress: 'Via del Corso 12, Rzym',
    attractions: { selected: [], budget: 0 },
    toggleAttraction: mockToggleAttraction,
    reset: mockReset,
  }),
}));

// 3. MOCKOWANIE BAZY DANYCH (POWERSYNC)
const mockDbExecute = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

// 4. MOCKOWANIE BIBLIOTEK ZEWNĘTRZNYCH (Kryptografia, Nawigacja, Mapy, Slider)
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-1234',
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn(); // <-- Wyciągamy goBack do stałej
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MockMapView = (props: any) => <View {...props} testID="map-view" />;
  MockMapView.Marker = (props: any) => <View {...props} testID="map-marker" />;
  MockMapView.Circle = (props: any) => <View {...props} testID="map-circle" />;
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMapView.Marker,
    Circle: MockMapView.Circle,
    PROVIDER_DEFAULT: 'default',
  };
});

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return (props: any) => <View {...props} testID="slider" />;
});

jest.mock('expo-constants', () => ({
  expoConfig: { android: { config: { googleMaps: { apiKey: 'TEST_API_KEY' } } } },
}));

// 5. MOCKOWANIE ALERTA ORAZ FUNKCJI FETCH
jest.spyOn(Alert, 'alert').mockImplementation(() => null);

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as any;

describe('Step4AttractionsScreen - Testy integracji z Google i zapisu wycieczki', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mockujemy inteligentnie `fetch` w zależności od URL-a
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('nominatim.openstreetmap.org')) {
        // Zwracamy koordynaty dla noclegu
        return { json: async () => [{ lat: '41.9028', lon: '12.4964' }] };
      }
      if (url.includes('maps.googleapis.com')) {
        // Zwracamy fałszywe atrakcje z Google Places
        return {
          json: async () => ({
            status: 'OK',
            results: [
              {
                place_id: 'place_1',
                name: 'Koloseum',
                vicinity: 'Piazza del Colosseo, Roma',
                geometry: { location: { lat: 41.8902, lng: 12.4922 } },
                rating: 4.8,
              },
              {
                place_id: 'place_2',
                name: 'Panteon',
                vicinity: 'Piazza della Rotonda, Roma',
                geometry: { location: { lat: 41.8986, lng: 12.4769 } },
                rating: 4.9,
              }
            ]
          })
        };
      }
      return { json: async () => ({}) };
    });
  });

  test('1. powinien poprawnie odpytać API o koordynaty i atrakcje przy ładowaniu', async () => {
    render(<Step4AttractionsScreen />);

    // Sprawdzamy czy interfejs wyrenderował poprawnie suwak promienia (tekst z pliku tłumaczeń)
    expect(screen.getByText('WYBÓR PROMIENIA')).toBeTruthy();

    await waitFor(() => {
      // 1x dla lokalizacji noclegu (Nominatim), 1x dla Google Places
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Sprawdzamy czy na ekranie pojawiły się nazwy pobranych atrakcji
      expect(screen.getByText('Koloseum')).toBeTruthy();
      expect(screen.getByText('Panteon')).toBeTruthy();
    });
  });

  test('2. powinien poprawnie filtrować atrakcje na liście przy użyciu wyszukiwarki tekstu', async () => {
    render(<Step4AttractionsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Koloseum')).toBeTruthy();
    });

    // Wpisujemy w szukajkę słowo "Pan" (żeby odfiltrować Panteon)
    const searchInput = screen.getByPlaceholderText('Szukaj zabytków, muzeów...');
    fireEvent.changeText(searchInput, 'Pan');

    await waitFor(() => {
      // Panteon powinien być widoczny
      expect(screen.getByText('Panteon')).toBeTruthy();
      // Koloseum powinno zniknąć z wyników
      expect(screen.queryByText('Koloseum')).toBeNull();
    });
  });

  test('3. powinien wywołać store po kliknięciu przycisku dodawania do osi czasu', async () => {
    render(<Step4AttractionsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Koloseum')).toBeTruthy();
    });

    // Znajdujemy przyciski "Dodaj do osi czasu" (będą dwa dla dwóch atrakcji, klikamy pierwszy)
    const addButtons = screen.getAllByText(/Dodaj do osi czasu/i);
    fireEvent.press(addButtons[0]);

    // Sprawdzamy czy wywołała się funkcja toggleAttraction z parametrem "Koloseum"
    expect(mockToggleAttraction).toHaveBeenCalledWith('Koloseum');
  });

  test('4. powinien poprawnie zserializować dane, zapisać je w PowerSync i wyczyścić store na zakończenie', async () => {
    render(<Step4AttractionsScreen />);

    // Czekamy aż wszystko się załaduje
    await waitFor(() => {
      expect(screen.getByText('Koloseum')).toBeTruthy();
    });

    // Klikamy główny przycisk zapisujący "Zakończ planowanie"
    const finishButton = screen.getByText('Zakończ planowanie');
    fireEvent.press(finishButton);

    await waitFor(() => {
      // 1. Weryfikacja wykonania zapytania SQL w PowerSync
      expect(mockDbExecute).toHaveBeenCalledTimes(1);
      
      // Wyciągamy argumenty z jakimi wywołano zapytanie do bazy
      const dbArgs = mockDbExecute.mock.calls[0];
      const sqlQuery = dbArgs[0];
      const sqlParams = dbArgs[1];

      expect(sqlQuery).toContain('INSERT INTO trips');
      
      // 2. Weryfikacja poprawności mapowania parametrów
      expect(sqlParams[0]).toBe('mock-uuid-1234'); // tripId
      expect(sqlParams[1]).toBe('test-user-123'); // userId
      expect(sqlParams[2]).toBe('Wakacje w Rzymie'); // tripName
      expect(sqlParams[3]).toBe('Warszawa'); // origin
      expect(sqlParams[4]).toBe('Rzym'); // destination
      expect(sqlParams[5]).toBe('10-08-2027'); // startDate
      expect(sqlParams[6]).toBe('20-08-2027'); // endDate
      
      // 3. Weryfikacja czy JSON zagnieżdżony w bazie jest poprawnie zbudowany
      expect(sqlParams[7]).toContain('"selectedOption":{"id":"flight-1"}'); // transport_data
      expect(sqlParams[8]).toContain('"lodgingAddress":"Via del Corso 12, Rzym"'); // lodging_data
      expect(sqlParams[9]).toContain('"selected":[]'); // attractions_data (w naszym mocku była pusta tablica)

      // 4. Weryfikacja wyczyszczenia stanu i nawigacji
      expect(Alert.alert).toHaveBeenCalledWith('DESTIVO', 'Podróż została pomyślnie zapisana!');
      expect(mockReset).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('Explore');
    });
  });

  test('5. powinien wyświetlić komunikat o braku atrakcji, gdy API zwróci pustą listę', async () => {
    // Nadpisujemy mocka tylko dla tego testu, aby Google API zwróciło 0 wyników
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('nominatim.openstreetmap.org')) {
        return { json: async () => [{ lat: '41.9028', lon: '12.4964' }] };
      }
      if (url.includes('maps.googleapis.com')) {
        return { json: async () => ({ status: 'ZERO_RESULTS', results: [] }) };
      }
      return { json: async () => ({}) };
    });

    render(<Step4AttractionsScreen />);

    await waitFor(() => {
      // Szukamy tekstu z pliku tłumaczeń (empty_results)
      expect(screen.getByText('Nie znaleziono żadnych atrakcji w tym promieniu.')).toBeTruthy();
    });
  });

  test('6. powinien wrócić do poprzedniego ekranu po kliknięciu przycisku Wstecz', () => {
    render(<Step4AttractionsScreen />);
    
    // Szukamy przycisku cofania (ma w środku tekst '←', zakodowany często jako puste miejsce lub ikonka)
    // Łatwiej znaleźć go przez testID, ale tu użyjemy getByText jeśli ikonka to konkretny znak, 
    // lub po prostu odpalimy pierwszy przycisk w topNav. Dla uproszczenia:
    const backButton = screen.getByText('←'); // Dopasuj do znaku jakiego używasz w <Text style={styles.backIcon}>
    fireEvent.press(backButton);

    expect(mockNavigate.mock.calls.length).toBe(0); // Nie idziemy do przodu
    expect(jest.requireMock('@react-navigation/native').useNavigation().goBack).toHaveBeenCalledTimes(1);
  });

  test('7. powinien wyświetlić Alert i przerwać pobieranie, gdy brakuje klucza Google API', async () => {
    // Symulujemy brak klucza API
    jest.requireMock('expo-constants').expoConfig.android.config.googleMaps.apiKey = '';

    render(<Step4AttractionsScreen />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('DESTIVO', 'Brak poprawnego klucza Google API w app.json.');
    });

    // Przywracamy klucz dla innych testów
    jest.requireMock('expo-constants').expoConfig.android.config.googleMaps.apiKey = 'TEST_API_KEY';
  });

  test('8. powinien ponownie odpytać Google API przy zmianie wartości suwaka (promienia)', async () => {
    render(<Step4AttractionsScreen />);

    await waitFor(() => {
      // 1x dla OSM, 1x dla Google przy starcie
      expect(mockFetch).toHaveBeenCalledTimes(2); 
    });

    const slider = screen.getByTestId('slider');
    
    // Symulujemy przesunięcie suwaka na 15km
    fireEvent(slider, 'valueChange', 15.0);

    await waitFor(() => {
      // Powinno pójść trzecie zapytanie (ponowny fetch do Google po zmianie promienia)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});