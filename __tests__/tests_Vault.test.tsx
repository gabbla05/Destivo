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

// 1. Mock Auth Store
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user-id', email: 'test@destivo.io', isGuest: false },
    isGuest: false,
    language: 'pl',
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
  });
});