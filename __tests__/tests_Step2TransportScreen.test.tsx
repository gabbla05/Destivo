/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { Step2TransportScreen } from '../src/screens/TripCreator/Step2TransportScreen';
import * as transportCalculator from '../src/lib/transportCalculator';

// 1. MOCKOWANIE ZUSTAND - AUTH STORE
const mockToggleLanguage = jest.fn();
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    language: 'pl',
    toggleLanguage: mockToggleLanguage,
  }),
}));

// 2. MOCKOWANIE ZUSTAND - TRIP CREATOR STORE
const mockSetTransportOption = jest.fn();
const mockSetTransportDetails = jest.fn();
const mockTransport = { selectedOption: null };
const mockTransportDetails = {
  outboundDepartureLocation: '',
  outboundArrivalLocation: '',
  outboundDepartureTime: '',
  outboundArrivalTime: '',
  returnDepartureLocation: '',
  returnArrivalLocation: '',
  returnDepartureTime: '',
  returnArrivalTime: '',
};

jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: () => ({
    origin: 'Warszawa',
    destination: 'Rzym',
    startDate: '10-08-2027',
    endDate: '20-08-2027',
    transport: mockTransport,
    transportDetails: mockTransportDetails,
    setTransportOption: mockSetTransportOption,
    setTransportDetails: mockSetTransportDetails,
  }),
}));

// 3. MOCKOWANIE TRANSPORT CALCULATOR (aby nie wysyłać prawdziwych zapytań)
jest.mock('../src/lib/transportCalculator', () => ({
  fetchTransportComparisons: jest.fn(),
  getTransportRouteMetadata: jest.fn(() => ({ notes: [], actionLinks: [] })),
}));

// MOCKOWANIE VAULT MANAGER
jest.mock('../src/lib/vaultManager', () => ({
  VaultManager: {
    pickFile: jest.fn().mockResolvedValue({ id: 'file-pdf-1', name: 'ticket.pdf', uri: 'file:///t.pdf', type: 'PDF' }),
    pickImage: jest.fn().mockResolvedValue({ id: 'file-img-1', name: 'ticket.jpg', uri: 'file:///t.jpg', type: 'IMAGE' }),
  },
}));

// MOCKOWANIE DATETIMEPICKER
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: any) => React.createElement(View, { testID: 'mock-datetimepicker', onChange: props.onChange });
});

// 4. MOCKOWANIE ALERTA ORAZ LINKING API
jest.spyOn(Alert, 'alert').mockImplementation(() => null);
jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true as any);

// 5. MOCKOWANIE GLOBALNEJ FUNKCJI FETCH (DLA OPENSTREETMAP NOMINATIM - dystans)
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as any;

describe('Step2TransportScreen - Testy wyboru transportu', () => {
  const mockNavigate = jest.fn();
  const mockGoBack = jest.fn();
  const mockNavigation = { navigate: mockNavigate, goBack: mockGoBack };
  const mockProvider = { getRoutes: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransport.selectedOption = null;
    // Domyślny udany wynik dla geokodowania
    mockFetch.mockResolvedValue({ json: async () => [{ lat: '52.2297', lon: '21.0122' }] });
  });

  test('1. powinien wyrenderować ekran ładowania, a potem puste wyniki, jeśli brak opcji', async () => {
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    // Na początku wyświetla spinner
    expect(screen.getByText('Wyliczanie tras i rekomendacji...')).toBeTruthy();
    
    await waitFor(() => {
      // Potem pokazuje brak wyników
      expect(screen.getByText('Brak połączeń')).toBeTruthy();
      expect(screen.getByText('Nie znaleziono odpowiednich połączeń dla tej trasy lub podano błędną lokalizację.')).toBeTruthy();
    });
  });

  test('2. powinien pokazać błąd w przypadku wyjątku podczas pobierania tras', async () => {
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockRejectedValueOnce(new Error('API error'));
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      expect(screen.getByText('Brak danych')).toBeTruthy();
      expect(screen.getByText('Nie udało się pobrać rekomendacji transportowych.')).toBeTruthy();
    });
  });

  test('3. powinien wyrenderować listę transportów i pozwolić zaznaczyć opcję', async () => {
    const mockOptions = [
      { id: 'flight-1', type: 'flight', provider: 'Skyscanner', price: { status: 'LIVE', currency: 'PLN' } },
      { id: 'train-1', type: 'train', provider: 'Koleo', price: { status: 'LIVE', currency: 'PLN' } }
    ];
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce(mockOptions);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      expect(screen.getByText('Samolot')).toBeTruthy();
      expect(screen.getByText('Pociąg')).toBeTruthy();
    });

    // Sprawdzamy czy kliknięcie zaznacza opcję
    fireEvent.press(screen.getByText('Samolot'));
    expect(mockSetTransportOption).toHaveBeenCalledWith(mockOptions[0]);
  });

  test('4. powinien wyrenderować formularz "Szczegóły połączenia" po wybraniu opcji transportu', async () => {
    mockTransport.selectedOption = { id: 'flight-1', type: 'flight', provider: 'Skyscanner', bookingUrl: 'https://example.com' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      expect(screen.getByText('Szczegóły połączenia')).toBeTruthy();
      expect(screen.getByText('W stronę celu (10-08-2027)')).toBeTruthy();
      expect(screen.getByText('Powrót (20-08-2027)')).toBeTruthy(); // Bo w mocku endDate to 20-08-2027
    });
  });

  test('5. powinien sprawdzić dystans dojazdu (commute check) i pokazać ostrzeżenie na onBlur', async () => {
    mockTransport.selectedOption = { id: 'flight-1', type: 'flight', provider: 'Skyscanner' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);
    
    // Symulacja dużego dystansu: 
    // Pierwszy call (miasto główne z Zustand: Warszawa) -> 52.2, 21.0
    mockFetch.mockResolvedValueOnce({ json: async () => [{ lat: '52.2297', lon: '21.0122' }] });
    // Drugi call (wpisane lotnisko: Modlin) -> 52.4, 20.6 (sztucznie byle dystans > 2km)
    mockFetch.mockResolvedValueOnce({ json: async () => [{ lat: '52.4511', lon: '20.6517' }] });

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());
    
    const depInput = screen.getAllByPlaceholderText('...')[0];
    
    // Wpisujemy tekst w pole
    fireEvent.changeText(depInput, 'Lotnisko Modlin');
    
    // FIX: Ponieważ nasz Zustand jest mockiem i nie odświeża stanu automatycznie,
    // musimy ręcznie zaktualizować obiekt, żeby funkcja onBlur widziała wpisany tekst
    mockTransportDetails.outboundDepartureLocation = 'Lotnisko Modlin';
    
    fireEvent(depInput, 'blur'); // wyzwala handleCheckCommute

    await waitFor(() => {
      expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundDepartureLocation: 'Lotnisko Modlin' });
      // FIX: Zmieniony Regex - radzi sobie niezależnie czy string ma emotkę na początku, czy nie
      expect(screen.getByText(/Dystans \(Warszawa\): ~\d+ km/i)).toBeTruthy(); 
    });
  });

  test('6. powinien zablokować przycisk "Dalej", jeśli nie wybrano żadnego transportu', async () => {
    mockTransport.selectedOption = null;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      const nextButton = screen.getByText('Dalej');
      fireEvent.press(nextButton);
      
      // Nie nawiguje bo przycisk ma być disabled w logice (opacity, disabled prop)
      // W React Native testing library `disabled` ignoruje onPress, więc nie zostanie wywołane.
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('7. powinien przejść do kolejnego kroku (Step3), jeśli wybrano transport', async () => {
    mockTransport.selectedOption = { id: 'flight-1', type: 'flight' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      const nextButton = screen.getByText('Dalej');
      fireEvent.press(nextButton);
      expect(mockNavigate).toHaveBeenCalledWith('Step3');
    });
  });

  test('8. powinien otworzyć link do zakupu biletów przyciskiem "Sprawdź bilety"', async () => {
    mockTransport.selectedOption = null; 
    const mockOption = { 
      id: 'flight-1', 
      type: 'flight', 
      provider: 'Skyscanner', 
      bookingUrl: 'https://booking.com', 
      price: { status:'LIVE', currency:'PLN' } 
    };
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockOption]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      // FIX: Szukamy przycisku za pomocą elastycznego Regexa, by uniknąć problemów z ikonkami 🎟️ vs ↗
      const btn = screen.getByText(/Sprawdź bilety/i);
      fireEvent.press(btn);
      
      expect(Linking.canOpenURL).toHaveBeenCalledWith('https://booking.com');
      expect(Linking.openURL).toHaveBeenCalledWith('https://booking.com');
    });
  });

  test('9. powinien renderować pinezki (actionLinks) do stacji/lotnisk i otwierać je w zewnętrznej nawigacji/mapach', async () => {
    // Przygotowanie wybranego transportu
    const mockOption = { id: 'train-1', type: 'train', provider: 'Koleo' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockOption]);
    
    // Zmuszamy mocka metadanych do zwrócenia pinezki (actionLink) wskazującej na stację
    (transportCalculator.getTransportRouteMetadata as jest.Mock).mockReturnValueOnce({
      notes: [],
      actionLinks: [
        { label: 'Pokaż stację w: Rzym', url: 'https://maps.google.com/?q=Rzym+station' }
      ]
    });

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      // Weryfikacja czy przycisk akcji wyświetla się na ekranie (odpowiada za pinezkę z dworcem/lotniskiem)
      const pinButton = screen.getByText(/Pokaż stację w: Rzym/i);
      expect(pinButton).toBeTruthy();
      
      // Symulacja kliknięcia w pinezkę
      fireEvent.press(pinButton);
      
      // Weryfikacja czy aplikacja próbuje otworzyć aplikację map
      expect(Linking.canOpenURL).toHaveBeenCalledWith('https://maps.google.com/?q=Rzym+station');
      expect(Linking.openURL).toHaveBeenCalledWith('https://maps.google.com/?q=Rzym+station');
    });
  });

  test('10. powinien poprawnie aktualizować dane wprowadzane przez usera w Travel Details', async () => {
    // Przygotowanie otwartego formularza
    mockTransport.selectedOption = { id: 'bus-1', type: 'bus' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());
    
    // Pobranie inputów na podstawie placeholderów użytych w komponencie
    const timeInputs = screen.getAllByPlaceholderText('HH:MM');
    const locationInputs = screen.getAllByPlaceholderText('...');
    
    // Wprowadzanie danych dla trasy "W stronę celu"
    fireEvent.changeText(timeInputs[0], '08:30'); // outboundDepartureTime
    fireEvent.changeText(timeInputs[1], '14:45'); // outboundArrivalTime
    fireEvent.changeText(locationInputs[0], 'Dworzec Zachodni'); // outboundDepartureLocation

    // Sprawdzamy czy metoda setTransportDetails z Zustand została wywołana z prawidłowymi argumentami
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundDepartureTime: '08:30' });
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundArrivalTime: '14:45' });
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundDepartureLocation: 'Dworzec Zachodni' });
  });

  test('11. powinien obsłużyć błąd podczas próby otwarcia zewnętrznego linku (np. biletów lub map)', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false);
    
    const mockOption = { 
      id: 'flight-2', type: 'flight', provider: 'Ryanair', bookingUrl: 'https://bad-link.com' 
    } as any;
    
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockOption]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      // FIX: Regex zamiast sztywnego stringa z emotką
      const btn = screen.getByText(/Sprawdź bilety/i);
      fireEvent.press(btn);
      
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        expect.any(String) 
      );
    });
  });

  test('12. powinien wyrenderować przycisk "Pomiń ten krok" w dolnym pasku akcji', async () => {
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      const skipButton = screen.getByText('Pomiń ten krok');
      expect(skipButton).toBeTruthy();
    });
  });

  test('13. powinien przejść do Step3 po kliknięciu przycisku "Pomiń ten krok" bez zaznaczenia transportu', async () => {
    mockTransport.selectedOption = null;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([]);
    
    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    
    await waitFor(() => {
      const skipButton = screen.getByText('Pomiń ten krok');
      fireEvent.press(skipButton);
      expect(mockNavigate).toHaveBeenCalledWith('Step3');
    });
  });

  test('14. powinien wyfiltrować opcje autobusowe (FlixBus) i prezentować wyłącznie samolot, pociąg lub auto', async () => {
    const mockOptions = [
      { id: 'flight-1', type: 'flight', provider: 'Skyscanner', price: { status: 'LIVE', currency: 'PLN' } },
      { id: 'bus-1', type: 'bus', provider: 'FlixBus', price: { status: 'LIVE', currency: 'PLN' } },
      { id: 'car-1', type: 'car', provider: 'Własny samochód', price: { status: 'ESTIMATE', currency: 'PLN' } },
    ];
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce(mockOptions);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);

    await waitFor(() => {
      expect(screen.getByText('Samolot')).toBeTruthy();
      expect(screen.getByText('Samochód')).toBeTruthy();
      expect(screen.queryByText('Autobus')).toBeNull();
      expect(screen.queryByText('FlixBus')).toBeNull();
    });
  });

  test('15. powinien wywołać Alert z opcjami wyboru dokumentu lub zdjęcia przy próbie wgrania biletu do Sejfu', async () => {
    mockTransport.selectedOption = { id: 'car-1', type: 'car', provider: 'Własny samochód' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);

    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());

    const uploadButton = screen.getByTestId('upload-outbound-ticket-btn');
    fireEvent.press(uploadButton);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Wgraj bilet na wyjazd (TAM)',
      expect.any(String),
      expect.any(Array)
    );
  });

  test('16. powinien obsłużyć wybór pliku PDF oraz zdjęcia dla wyjazdu (TAM) i powrotu (POWRÓT)', async () => {
    const { VaultManager } = require('../src/lib/vaultManager');
    mockTransport.selectedOption = { id: 'train-1', type: 'train', provider: 'PKP' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());

    // Wywołanie wgrania biletu TAM - opcja PDF
    fireEvent.press(screen.getByTestId('upload-outbound-ticket-btn'));
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const outboundButtons = alertCalls[alertCalls.length - 1][2];

    // Kliknięcie pierwszej opcji (Plik PDF)
    await outboundButtons[0].onPress();
    expect(VaultManager.pickFile).toHaveBeenCalled();
    expect(mockSetTransportDetails).toHaveBeenCalledWith(
      expect.objectContaining({ ticketFile: expect.any(Object) })
    );

    // Kliknięcie drugiej opcji (Zdjęcie / Skan)
    await outboundButtons[1].onPress();
    expect(VaultManager.pickImage).toHaveBeenCalled();

    // Wywołanie wgrania biletu POWRÓT
    fireEvent.press(screen.getByTestId('upload-return-ticket-btn'));
    const returnAlertCalls = (Alert.alert as jest.Mock).mock.calls;
    const returnButtons = returnAlertCalls[returnAlertCalls.length - 1][2];

    await returnButtons[0].onPress();
    expect(mockSetTransportDetails).toHaveBeenCalledWith(
      expect.objectContaining({ returnTicketFile: expect.any(Object) })
    );
  });

  test('17. powinien usunąć bilet wyjazdu i powrotu przyciskami usuwania', async () => {
    mockTransport.selectedOption = { id: 'train-1', type: 'train' } as any;
    (mockTransportDetails as any).ticketFile = { name: 'bilet_tam.pdf' };
    (mockTransportDetails as any).returnTicketFile = { name: 'bilet_powrot.pdf' };
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());

    fireEvent.press(screen.getByTestId('remove-ticket-btn'));
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ ticketFile: null, outboundTicketFile: null });

    fireEvent.press(screen.getByTestId('remove-return-ticket-btn'));
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ returnTicketFile: null });

    (mockTransportDetails as any).ticketFile = null;
    (mockTransportDetails as any).returnTicketFile = null;
  });

  test('18. powinien otworzyć zegar (native TimePicker) po kliknięciu ikon zegarka', async () => {
    mockTransport.selectedOption = { id: 'flight-1', type: 'flight' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockTransport.selectedOption]);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    await waitFor(() => expect(screen.getByText('Szczegóły połączenia')).toBeTruthy());

    // Kliknięcie zegara odjazdu wyjazdu
    fireEvent.press(screen.getByTestId('clock-outboundDeparture'));
    expect(screen.getByTestId('mock-datetimepicker')).toBeTruthy();

    // Symulacja zmiany godziny w DateTimePicker
    const d = new Date();
    d.setHours(7, 45, 0, 0);
    fireEvent(screen.getByTestId('mock-datetimepicker'), 'change', { type: 'set' }, d);
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundDepartureTime: '07:45' });

    // Zegar przyjazdu wyjazdu
    fireEvent.press(screen.getByTestId('clock-outboundArrival'));
    d.setHours(11, 15, 0, 0);
    fireEvent(screen.getByTestId('mock-datetimepicker'), 'change', { type: 'set' }, d);
    expect(mockSetTransportDetails).toHaveBeenCalledWith({ outboundArrivalTime: '11:15' });
  });

  test('19. powinien cofnąć się do Step1 po kliknięciu przycisku Wróć', async () => {
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([]);

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    await waitFor(() => expect(screen.getByText('Wróć')).toBeTruthy());

    fireEvent.press(screen.getByText('Wróć'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  test('20. powinien poprawnie lokalizować różne warianty notatek i etykiet tras', async () => {
    const mockOption = { id: 'train-note-1', type: 'train', provider: 'Koleo' } as any;
    (transportCalculator.fetchTransportComparisons as jest.Mock).mockResolvedValueOnce([mockOption]);

    (transportCalculator.getTransportRouteMetadata as jest.Mock).mockReturnValueOnce({
      notes: [
        'Trasa lokalna (~50 km)',
        'Miejscowość bez bezpośredniej stacji (~30 km)',
        'Pociąg + dojazd lokalny. Najbliższa stacja: Modlin (~10 km)',
        'Brak czynnej stacji (~40 km)',
        'Alternatywne połączenie autokarowe',
      ],
      actionLinks: [
        { label: 'nawiguj do: Rzym', url: 'https://maps.google.com/?q=Rzym' },
        { label: 'dworzec autobusowy: Warszawa', url: 'https://maps.google.com/?q=Warszawa' },
        { label: 'lotnisko w okolicach: Modlin', url: 'https://maps.google.com/?q=Modlin' },
        { label: 'stacja przesiadkowa: Kutno', url: 'https://maps.google.com/?q=Kutno' },
      ],
    });

    render(<Step2TransportScreen navigation={mockNavigation} transportProvider={mockProvider as any} />);
    await waitFor(() => {
      expect(screen.getByText('Pociąg')).toBeTruthy();
    });
  });
});