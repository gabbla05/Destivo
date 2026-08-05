/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Step1DestinationScreen } from '../src/screens/TripCreator/Step1DestinationScreen';

// 1. MOCKOWANIE ZUSTAND - AUTH STORE
const mockToggleLanguage = jest.fn();
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    language: 'pl',
    toggleLanguage: mockToggleLanguage,
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
});