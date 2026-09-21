/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Vibration } from 'react-native';

// Importy testowanych ekranów
import { VaultScreen } from '../src/screens/Vault/VaultScreen';
import { VaultDashboardScreen } from '../src/screens/Vault/VaultDashboardScreen';

// Importy store'a
import { useVaultStore } from '../src/store/vaultStore';

// --------------------------------------------------------------------------
// MOCKOWANIE ZALEŻNOŚCI I BIBLIOTEK NATYWNYCH
// --------------------------------------------------------------------------

let mockLanguage = 'pl';
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user-id', email: 'test@destivo.io', isGuest: false },
    isGuest: false,
    language: mockLanguage,
  }),
}));

// 2. Mock PowerSync
const mockDbExecute = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

// 3. Mock Supabase
const mockSupabaseUpdateEq = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = jest.fn().mockImplementation(() => ({
  eq: mockSupabaseUpdateEq,
}));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: mockSupabaseUpdate,
    })),
  },
}));

// 4. Mock Local Authentication (Biometria)
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

// 5. Mock Systemu Plików i Wybierania Dokumentów
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://temp/ticket.pdf', name: 'ticket.pdf' }],
  }),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://temp/hotel_booking.jpg', name: 'hotel_booking.jpg' }],
  }),
  MediaTypeOptions: { Images: 'Images' }
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://mock_docs/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(true),
  copyAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-9999',
}));

// Mock Alert & Vibration
jest.spyOn(Alert, 'alert').mockImplementation(() => null);
jest.spyOn(Vibration, 'vibrate').mockImplementation(() => null);

// Mock Nawigacji
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// --------------------------------------------------------------------------
// DANE TESTOWE
// --------------------------------------------------------------------------
const mockTripsData = [
  {
    id: 'trip-1',
    user_id: 'test-user-id',
    trip_name: 'Paryż 2026',
    start_date: '2026-09-01',
    lodging_data: '{}', // Brak wgranych plików
  }
];

// --------------------------------------------------------------------------
// SUITY TESTOWE
// --------------------------------------------------------------------------

describe('Moduł Sejfu Offline (Vault)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // Ponieważ w ekranie PIN użyto setTimeout na 100ms
    
    // Resetowanie stanu Zustand dla Sejfu przed każdym testem
    act(() => {
      useVaultStore.setState({ pin: null, isUnlocked: false, isBiometricsEnabled: false });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('1. Zabezpieczenia i Klawiatura (VaultPinScreen)', () => {
    test('Powinien pozwolić na poprawne utworzenie nowego PIN-u i odblokować sejf', async () => {
      render(<VaultScreen />);
      
      // Sprawdzamy czy to tryb ustawiania pinu
      expect(screen.getByText('Utwórz kod PIN')).toBeTruthy();

      // Wpisujemy '1234'
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));
      
      act(() => { jest.advanceTimersByTime(150); });

      // Powinno prosić o potwierdzenie
      await waitFor(() => {
        expect(screen.getByText('Potwierdź kod PIN')).toBeTruthy();
      });

      // Wpisujemy ponownie '1234'
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));
      
      act(() => { jest.advanceTimersByTime(150); });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Sukces', 'Kod PIN został ustawiony!');
        // Po ustawieniu PINu i odblokowaniu, ekran powinien zmienić się na Dashboard
        expect(screen.getByText('Szufladki Sejfu')).toBeTruthy();
      });
    });

    test('Powinien wyrzucić błąd wibrujący przy niezgodnym potwierdzeniu PIN-u', async () => {
      render(<VaultScreen />);
      
      // Wpisujemy '1234'
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));
      act(() => { jest.advanceTimersByTime(150); });

      // Wpisujemy błędne potwierdzenie '1111'
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('1'));
      act(() => { jest.advanceTimersByTime(150); });

      await waitFor(() => {
        expect(Vibration.vibrate).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith('Błąd', 'Kody PIN nie są identyczne. Spróbuj ponownie.');
        expect(useVaultStore.getState().isUnlocked).toBe(false);
      });
    });

    test('Powinien wyświetlać przetłumaczony przycisk WYCZYŚĆ w języku polskim i czyścić wpisany PIN', async () => {
      render(<VaultScreen />);
      
      // Sprawdzamy czy przycisk CLEAR jest przetłumaczony na WYCZYŚĆ w języku polskim
      const clearBtn = screen.getByText('WYCZYŚĆ');
      expect(clearBtn).toBeTruthy();

      // Wpisujemy cyfry
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));

      // Klikamy WYCZYŚĆ
      fireEvent.press(clearBtn);

      // Po kliknięciu 2 kolejnych cyfr PIN nie powinien się zatwierdzić, ponieważ poprzednie zostały wyczyszczone
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));
      act(() => { jest.advanceTimersByTime(150); });
      expect(screen.queryByText('Potwierdź kod PIN')).toBeNull();
    });
  });

  describe('2. Dashboard i Szufladki (VaultDashboardScreen)', () => {
    beforeEach(() => {
      // Wymuszamy, że sejf jest już odblokowany
      act(() => {
        useVaultStore.setState({ pin: '1234', isUnlocked: true });
      });
      // Mockujemy bazę
      mockDbExecute.mockResolvedValue({ rows: { _array: mockTripsData } });
    });

    test('Powinien wylistować zaplanowane podróże w postaci folderów', async () => {
      render(<VaultDashboardScreen />);
      
      await waitFor(() => {
        expect(screen.getByText('Paryż 2026')).toBeTruthy();
      });
    });

    test('Powinien otworzyć folder podróży po jego kliknięciu', async () => {
      render(<VaultDashboardScreen />);
      
      await waitFor(() => expect(screen.getByText('Paryż 2026')).toBeTruthy());
      
      // Klikamy w folder
      fireEvent.press(screen.getByText('Paryż 2026'));

      await waitFor(() => {
        expect(screen.getByText('SZUFLADKA PODRÓŻY:')).toBeTruthy();
        expect(screen.getByText('Wgraj plik (PDF)')).toBeTruthy();
        expect(screen.getByText('Ten sejf jest pusty.')).toBeTruthy();
      });
    });

    test('Zarządzanie Plikami (Dual-Write): Wgrywanie PDF używa DocumentPickera, updatuje PowerSync i Supabase', async () => {
      render(<VaultDashboardScreen />);
      
      // Otwieramy folder
      await waitFor(() => expect(screen.getByText('Paryż 2026')).toBeTruthy());
      fireEvent.press(screen.getByText('Paryż 2026'));
      await waitFor(() => expect(screen.getByText('Wgraj plik (PDF)')).toBeTruthy());

      // Klikamy Wgraj plik
      fireEvent.press(screen.getByText('Wgraj plik (PDF)'));

      await waitFor(() => {
        // Sprawdzamy czy wywołano natywny Document Picker
        expect(require('expo-document-picker').getDocumentAsync).toHaveBeenCalled();
        
        // Sprawdzamy czy plik skopiowano do lokalnego systemu
        expect(require('expo-file-system/legacy').copyAsync).toHaveBeenCalledWith({
          from: 'file://temp/ticket.pdf',
          to: 'file://mock_docs/destivo_vault/mock-uuid-9999.pdf',
        });

        // Weryfikacja Dual-Write
        // 1. Zapis do PowerSync
        expect(mockDbExecute).toHaveBeenCalledWith(
          'UPDATE trips SET lodging_data = ? WHERE id = ?',
          expect.any(Array) // Oczekujemy zaktualizowanego stringa JSON i ID trip-1
        );

        // 2. Zapis do Supabase
        expect(mockSupabaseUpdate).toHaveBeenCalled();
        expect(mockSupabaseUpdateEq).toHaveBeenCalledWith('id', 'trip-1');

        // Weryfikacja interfejsu
        expect(screen.getByText('ticket.pdf')).toBeTruthy();
        expect(screen.getByText('PDF • Wgrano lokalnie')).toBeTruthy();
      });
    });

    test('Otwieranie zapisanego pliku przez Expo Sharing', async () => {
      // Przygotowujemy folder, w którym już jest wgrany plik
      const tripWithFiles = [{
        ...mockTripsData[0],
        lodging_data: JSON.stringify({
          vaultFiles: [{
            id: 'file-123',
            name: 'bilet.pdf',
            type: 'PDF',
            uri: 'file://mock_docs/destivo_vault/mock.pdf'
          }]
        })
      }];
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: tripWithFiles } });

      render(<VaultDashboardScreen />);
      
      await waitFor(() => expect(screen.getByText('Paryż 2026')).toBeTruthy());
      fireEvent.press(screen.getByText('Paryż 2026'));

      // Plik powinien być widoczny
      await waitFor(() => expect(screen.getByText('bilet.pdf')).toBeTruthy());

      // Klikamy w plik, aby go otworzyć
      fireEvent.press(screen.getByText('bilet.pdf'));

      await waitFor(() => {
        expect(require('expo-sharing').shareAsync).toHaveBeenCalledWith('file://mock_docs/destivo_vault/mock.pdf');
      });
    });

    test('Drukowanie zapisanego pliku bezpośrednio z karty pliku', async () => {
      const tripWithFiles = [{
        ...mockTripsData[0],
        lodging_data: JSON.stringify({
          vaultFiles: [{
            id: 'file-123',
            name: 'bilet.pdf',
            type: 'PDF',
            uri: 'file://mock_docs/destivo_vault/mock.pdf'
          }]
        })
      }];
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: tripWithFiles } });

      render(<VaultDashboardScreen />);
      
      await waitFor(() => expect(screen.getByText('Paryż 2026')).toBeTruthy());
      fireEvent.press(screen.getByText('Paryż 2026'));

      await waitFor(() => expect(screen.getByTestId('print-file-file-123')).toBeTruthy());
      fireEvent.press(screen.getByTestId('print-file-file-123'));

      await waitFor(() => {
        expect(require('expo-print').printAsync).toHaveBeenCalledWith({
          uri: 'file://mock_docs/destivo_vault/mock.pdf'
        });
      });
    });

    test('Powinien automatycznie otworzyć szufladkę podróży po przekazaniu tripId w parametrach route', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: mockTripsData } });

      render(<VaultDashboardScreen route={{ params: { tripId: 'trip-1' } }} />);

      await waitFor(() => {
        expect(screen.getByText('SZUFLADKA PODRÓŻY:')).toBeTruthy();
        expect(screen.getByText('Wgraj plik (PDF)')).toBeTruthy();
        expect(screen.getByText('Ten sejf jest pusty.')).toBeTruthy();
      });
    });

    test('Powinien renderować banner Offline Travel Briefing i generować dokument PDF po kliknięciu', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: mockTripsData } });

      render(<VaultDashboardScreen route={{ params: { tripId: 'trip-1' } }} />);

      await waitFor(() => {
        expect(screen.getByText('Offline Travel Briefing')).toBeTruthy();
        expect(screen.getByText('100% OFFLINE')).toBeTruthy();
        expect(screen.getByTestId('generate-briefing-btn')).toBeTruthy();
      });

      // Klikamy generowanie briefingu
      await act(async () => {
        fireEvent.press(screen.getByTestId('generate-briefing-btn'));
      });

      // Powinien pojawić się modal z opcjami udostępnienia, druku, zapisu w sejfie i podglądu
      await waitFor(() => {
        expect(screen.getByText('Dokument PDF gotowy!')).toBeTruthy();
        expect(screen.getByText('Udostępnij / Wyślij bliskim (PDF)')).toBeTruthy();
        expect(screen.getByText('Drukuj (AirPrint / Drukarka)')).toBeTruthy();
        expect(screen.getByText('Zapisz w tej szufladce Sejfu')).toBeTruthy();
        expect(screen.getByText('Podgląd w aplikacji')).toBeTruthy();
      });

      // Test opcji Udostępnij
      await act(async () => {
        fireEvent.press(screen.getByText('Udostępnij / Wyślij bliskim (PDF)'));
      });
      expect(require('expo-sharing').shareAsync).toHaveBeenCalledWith(
        expect.stringContaining('destivo_briefing.pdf'),
        expect.objectContaining({ mimeType: 'application/pdf' })
      );

      // Test opcji Drukuj
      await act(async () => {
        fireEvent.press(screen.getByText('Drukuj (AirPrint / Drukarka)'));
      });
      expect(require('expo-print').printAsync).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.any(String) })
      );

      // Test opcji Zapisz w Sejfie
      await act(async () => {
        fireEvent.press(screen.getByText('Zapisz w tej szufladce Sejfu'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'DESTIVO',
        'Travel Briefing został zapisany w Sejfie tej podróży!'
      );
    });

    test('Powinien renderować wszystkie teksty i podpisy po angielsku gdy język to EN', async () => {
      mockLanguage = 'en';
      mockDbExecute.mockResolvedValueOnce({ rows: { _array: mockTripsData } });

      render(<VaultDashboardScreen route={{ params: { tripId: 'trip-1' } }} />);

      await waitFor(() => {
        expect(screen.getByText('Offline Travel Briefing')).toBeTruthy();
        expect(screen.getByText('Generate PDF document ➔')).toBeTruthy();
        expect(screen.getByText('One-click PDF with trip essentials, lodging address, and day-by-day itinerary.')).toBeTruthy();
      });

      // Klikamy generowanie po angielsku
      await act(async () => {
        fireEvent.press(screen.getByTestId('generate-briefing-btn'));
      });

      // Sprawdzamy modal po angielsku
      await waitFor(() => {
        expect(screen.getByText('PDF document ready!')).toBeTruthy();
        expect(screen.getByText('Share / Send to loved ones (PDF)')).toBeTruthy();
        expect(screen.getByText('WhatsApp, email, AirDrop or Cloud drive')).toBeTruthy();
        expect(screen.getByText('Print (AirPrint / Printer)')).toBeTruthy();
        expect(screen.getByText('Print and keep in backpack')).toBeTruthy();
        expect(screen.getByText('Save to this Vault drawer')).toBeTruthy();
        expect(screen.getByText('Will be accessible in trip files list')).toBeTruthy();
        expect(screen.getByText('Preview in app')).toBeTruthy();
        expect(screen.getByText('Review the generated document')).toBeTruthy();
        expect(screen.getByText('Close')).toBeTruthy();
      });

      mockLanguage = 'pl';
    });
  });
});