/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Step1DestinationScreen } from '../src/screens/TripCreator/Step1DestinationScreen';

// 1. MOCKOWANIE ZUSTAND - AUTH STORE
const mockToggleLanguage = jest.fn();
const mockLogout = jest.fn();
const mockAuthState: {
  user: any;
  isGuest: boolean;
  language: 'pl' | 'en';
  toggleLanguage: any;
  logout: any;
} = {
  user: { id: 'test-user-123', isGuest: false },
  isGuest: false,
  language: 'pl',
  toggleLanguage: mockToggleLanguage,
  logout: mockLogout,
};

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// Mock PowerSync
const mockDbExecute = jest.fn().mockResolvedValue({ rows: [], array: [] });
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

// 2. MOCKOWANIE ZUSTAND - TRIP CREATOR STORE
const mockSetStep1Data = jest.fn();
jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: () => ({
    tripName: '',
    origin: '',
    destination: '',
    startDate: '',
    endDate: '',
    setStep1Data: mockSetStep1Data,
  }),
}));

// 3. MOCKOWANIE ALERTA
jest.spyOn(Alert, 'alert').mockImplementation(() => null);

// 4. MOCKOWANIE GLOBALNEJ FUNKCJI FETCH (DLA OPENSTREETMAP NOMINATIM)
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as any;

describe('Step1DestinationScreen - Testy walidacji i nawigacji', () => {
  const mockNavigate = jest.fn();
  const mockNavigation = {
    navigate: mockNavigate,
    goBack: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { id: 'test-user-123', isGuest: false };
    mockAuthState.isGuest = false;
    mockAuthState.language = 'pl';
    mockDbExecute.mockResolvedValue({ rows: [], array: [] });
    // Domyślnie symulujemy, że Nominatim zwraca istniejącą miejscowość (niepusta tablica)
    mockFetch.mockResolvedValue({
      json: async () => [{ place_id: 1, display_name: 'Rzym, Włochy' }],
    });
  });

  test('1. powinien poprawnie wyrenderować pola formularza z polskiego słownika', () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    expect(screen.getByText('KROK 1 Z 4')).toBeTruthy();
    expect(screen.getByPlaceholderText('np. Rzym')).toBeTruthy();
    expect(screen.getByPlaceholderText('np. Warszawa')).toBeTruthy();
    expect(screen.getByPlaceholderText('np. Wakacje we Włoszech')).toBeTruthy();
  });

  test('2. powinien pokazać błąd w Alercie, gdy pole celu podróży (destination) jest puste', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Pole celu podróży (Dokąd jedziesz?) jest wymagane w Kroku 1.'
      );
      expect(mockSetStep1Data).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('3. powinien pokazać błąd przy niepoprawnym formacie daty (np. 31/12/2026 zamiast DD-MM-YYYY)', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    // Wpisujemy datę ze złym separatorem
    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    fireEvent.changeText(dateInputs[0], '31/12/2026');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Niepoprawny format daty. Użyj DD-MM-YYYY (np. 15-08-2026).'
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('4. powinien pokazać błąd, gdy wpisana data wyjazdu jest z przeszłości', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    // Data z przeszłości
    fireEvent.changeText(dateInputs[0], '01-01-2000');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Data wyjazdu nie może być z przeszłości.'
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('5. powinien pokazać błąd, gdy data powrotu jest wcześniejsza niż data wyjazdu', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    // Wyjazd w 2027, ale powrót w 2026
    fireEvent.changeText(dateInputs[0], '10-10-2027');
    fireEvent.changeText(dateInputs[1], '10-10-2026');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Data powrotu musi być późniejsza lub równa dacie wyjazdu.'
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('6. powinien pokazać błąd z API, gdy miejscowość nie istnieje (pusta tablica z Nominatim)', async () => {
    // Symulujemy, że API nie znalazło miejscowości (zwraca puste array [])
    mockFetch.mockResolvedValueOnce({
      json: async () => [],
    });

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'NieistniejaceMiasto123');
    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Nie znaleźliśmy takiej miejscowości. Sprawdź pisownię.'
      );
      expect(mockSetStep1Data).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('7. powinien pomyślnie zapisać dane do store i przejść do Step2Transport przy poprawnych danych', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    fireEvent.changeText(screen.getByPlaceholderText('np. Warszawa'), 'Warszawa');
    fireEvent.changeText(screen.getByPlaceholderText('np. Wakacje we Włoszech'), 'Włochy 2027');

    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    fireEvent.changeText(dateInputs[0], '10-08-2027');
    fireEvent.changeText(dateInputs[1], '20-08-2027');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      // 1. Sprawdzamy czy odpytano API OpenStreetMap
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org/search'),
        expect.any(Object)
      );

      // 2. Sprawdzamy czy dane zapisano do Zustand store
      expect(mockSetStep1Data).toHaveBeenCalledWith({
        tripName: 'Włochy 2027',
        origin: 'Warszawa',
        destination: 'Rzym',
        startDate: '10-08-2027',
        endDate: '20-08-2027',
      });

      // 3. Sprawdzamy czy nawigacja przeniosła na kolejny krok
      expect(mockNavigate).toHaveBeenCalledWith('Step2Transport');
    });
  });

  test('8. powinien obsłużyć błąd sieci (Offline-First) bez blokowania użytkownika', async () => {
    // Symulujemy całkowity brak dostępu do sieci (API rzuca wyjątkiem)
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      // W architekturze Offline-First błąd połączenia nie powinien wywoływać alertu o braku miasta
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockSetStep1Data).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('Step2Transport');
    });
  });

  test('9. powinien pokazać błąd z API, gdy wpisana miejscowość wyjazdu (origin) nie istnieje', async () => {
    // Symulujemy:
    // 1. Pierwsze zapytanie (destination: "Rzym") -> zwraca istniejące miasto
    // 2. Drugie zapytanie (origin: "NieistniejaceMiasto123") -> zwraca pustą tablicę []
    mockFetch
      .mockResolvedValueOnce({
        json: async () => [{ place_id: 1, display_name: 'Rzym, Włochy' }],
      })
      .mockResolvedValueOnce({
        json: async () => [],
      });

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    fireEvent.changeText(
      screen.getByPlaceholderText('np. Warszawa'),
      'NieistniejaceMiasto123'
    );

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Nie znaleźliśmy takiej miejscowości. Sprawdź pisownię.'
      );
      expect(mockSetStep1Data).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('10. powinien zablokować gościa i wyświetlić alert z opcjami, jeśli gość ma już zapisaną podróż', async () => {
    mockAuthState.user = { id: 'guest-session', isGuest: true };
    mockAuthState.isGuest = true;
    mockDbExecute.mockResolvedValue({ rows: [{ id: 'existing-trip' }] });

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(mockDbExecute).toHaveBeenCalledWith(
        'SELECT 1 FROM trips WHERE user_id = ? LIMIT 1',
        ['guest-session']
      );
      expect(Alert.alert).toHaveBeenCalledWith(
        'Limit konta gościa',
        expect.stringContaining('Konto gościa pozwala na zaplanowanie maksymalnie 1 podróży'),
        expect.any(Array)
      );
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(alertButtons).toHaveLength(3);

    // 1. Cancel button -> goBack
    alertButtons[0].onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();

    // 2. Go to trips button -> navigate to MainTabs / Trips
    alertButtons[1].onPress();
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Trips' });

    // 3. Login button -> logout
    alertButtons[2].onPress();
    expect(mockLogout).toHaveBeenCalled();
  });

  test('11. powinien pozwolić gościowi przejść do Step2, jeśli nie ma jeszcze żadnej podróży', async () => {
    mockAuthState.user = { id: 'guest-session', isGuest: true };
    mockAuthState.isGuest = true;
    mockDbExecute.mockResolvedValue({ rows: [] });

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    fireEvent.changeText(screen.getByPlaceholderText('np. Warszawa'), 'Warszawa');
    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    fireEvent.changeText(dateInputs[0], '10-08-2027');
    fireEvent.changeText(dateInputs[1], '20-08-2027');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(mockSetStep1Data).toHaveBeenCalledWith({
        tripName: 'Podróż: Rzym',
        destination: 'Rzym',
        origin: 'Warszawa',
        startDate: '10-08-2027',
        endDate: '20-08-2027',
      });
      expect(mockNavigate).toHaveBeenCalledWith('Step2Transport');
    });
  });

  test('12. powinien pozwolić zalogowanemu użytkownikowi przejść dalej bez sprawdzania limitu gościa', async () => {
    mockAuthState.user = { id: 'registered-user-999', isGuest: false };
    mockAuthState.isGuest = false;

    render(<Step1DestinationScreen navigation={mockNavigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Rzym'), 'Rzym');
    fireEvent.changeText(screen.getByPlaceholderText('np. Warszawa'), 'Warszawa');
    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    fireEvent.changeText(dateInputs[0], '10-08-2027');
    fireEvent.changeText(dateInputs[1], '20-08-2027');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(mockDbExecute).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('Step2Transport');
    });
  });

  test('13. powinien automatycznie przekształcać wpisywane miasta na wielką literę (np. rzym -> Rzym, warszawa -> Warszawa)', async () => {
    render(<Step1DestinationScreen navigation={mockNavigation} />);

    const destInput = screen.getByPlaceholderText('np. Rzym');
    const originInput = screen.getByPlaceholderText('np. Warszawa');

    fireEvent.changeText(destInput, 'rzym');
    fireEvent.changeText(originInput, 'warszawa');

    expect(destInput.props.value).toBe('Rzym');
    expect(originInput.props.value).toBe('Warszawa');

    const dateInputs = screen.getAllByPlaceholderText('DD-MM-YYYY');
    fireEvent.changeText(dateInputs[0], '10-08-2027');
    fireEvent.changeText(dateInputs[1], '20-08-2027');

    fireEvent.press(screen.getByText(/Dalej/i));

    await waitFor(() => {
      expect(mockSetStep1Data).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'Rzym',
          origin: 'Warszawa',
        })
      );
    });
  });

  test('14. funkcja capitalizeCity poprawnie formatuje wieloczłonowe nazwy miast i znaki diakrytyczne', () => {
    const { capitalizeCity } = require('../src/screens/TripCreator/Step1DestinationScreen');
    expect(capitalizeCity('rzym')).toBe('Rzym');
    expect(capitalizeCity('nowy jork')).toBe('Nowy Jork');
    expect(capitalizeCity('bielsko-biała')).toBe('Bielsko-Biała');
    expect(capitalizeCity('zielona góra')).toBe('Zielona Góra');
    expect(capitalizeCity('łódź')).toBe('Łódź');
    expect(capitalizeCity('')).toBe('');
  });
});