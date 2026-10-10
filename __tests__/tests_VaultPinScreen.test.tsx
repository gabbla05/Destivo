/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Vibration } from 'react-native';
import { VaultPinScreen } from '../src/screens/Vault/VaultPinScreen';
import { useVaultStore } from '../src/store/vaultStore';
import { useAuthStore } from '../src/store/authStore';
import { supabase } from '../src/lib/supabase';
import * as LocalAuthentication from 'expo-local-authentication';

// Mock Supabase
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

// Mock LocalAuthentication
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

describe('VaultPinScreen - Ekran blokady i konfiguracji PIN Sejfu', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u-1', email: 'vaultuser@destivo.io', isGuest: false },
      isGuest: false,
      language: 'pl',
    });
    useVaultStore.setState({
      pin: null,
      isBiometricsEnabled: false,
      isUnlocked: false,
    });
  });

  describe('1. Tryb konfiguracji PIN-u (isSetupMode = true)', () => {
    test('wyświetla nagłówek tworzenia PIN-u i obsługuje klawisze numeryczne', async () => {
      render(<VaultPinScreen />);

      expect(screen.getByText('Utwórz kod PIN')).toBeTruthy();

      // Wpisujemy 1, 2, 3
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));

      // Klawisz clear ("WYCZYŚĆ")
      fireEvent.press(screen.getByText('WYCZYŚĆ'));

      // Wpisujemy pełny 4-cyfrowy kod: 1, 2, 3, 4
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));

      // Po wpisaniu 4 cyfr przechodzi do kroku CONFIRM
      await waitFor(() => {
        expect(screen.getByText('Potwierdź kod PIN')).toBeTruthy();
      });
    });

    test('obsługuje niezgodność przy potwierdzaniu PIN-u (mismatch)', async () => {
      render(<VaultPinScreen />);

      // Krok 1: Wpisujemy 1, 2, 3, 4
      fireEvent.press(screen.getByText('1'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('4'));

      await waitFor(() => {
        expect(screen.getByText('Potwierdź kod PIN')).toBeTruthy();
      });

      // Krok 2: Wpisujemy niezgodny PIN: 9, 9, 9, 9
      fireEvent.press(screen.getByText('9'));
      fireEvent.press(screen.getByText('9'));
      fireEvent.press(screen.getByText('9'));
      fireEvent.press(screen.getByText('9'));

      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Błąd', 'Kody PIN nie są identyczne. Spróbuj ponownie.');
        // Wraca do pierwszego kroku
        expect(screen.getByText('Utwórz kod PIN')).toBeTruthy();
      });
    });

    test('pomyślnie zapisuje PIN gdy potwierdzenie się zgadza', async () => {
      render(<VaultPinScreen />);

      // Krok 1: Wpisujemy 5, 6, 7, 8
      fireEvent.press(screen.getByText('5'));
      fireEvent.press(screen.getByText('6'));
      fireEvent.press(screen.getByText('7'));
      fireEvent.press(screen.getByText('8'));

      await waitFor(() => {
        expect(screen.getByText('Potwierdź kod PIN')).toBeTruthy();
      });

      // Krok 2: Wpisujemy 5, 6, 7, 8
      fireEvent.press(screen.getByText('5'));
      fireEvent.press(screen.getByText('6'));
      fireEvent.press(screen.getByText('7'));
      fireEvent.press(screen.getByText('8'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Sukces', 'Kod PIN został ustawiony!');
        expect(useVaultStore.getState().pin).toBe('5678');
        expect(useVaultStore.getState().isUnlocked).toBe(true);
      });
    });
  });

  describe('2. Tryb odblokowywania PIN-em i biometrią', () => {
    beforeEach(() => {
      useVaultStore.setState({
        pin: '1234',
        isBiometricsEnabled: true,
        isUnlocked: false,
      });
    });

    test('automatycznie uruchamia biometrię przy starcie gdy jest włączona', async () => {
      render(<VaultPinScreen />);

      await waitFor(() => {
        expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
        expect(useVaultStore.getState().isUnlocked).toBe(true);
      });
    });

    test('wpisanie poprawnego PIN-u odblokowuje sejf', async () => {
      useVaultStore.setState({ pin: '4321', isBiometricsEnabled: false, isUnlocked: false });

      render(<VaultPinScreen />);
      expect(screen.getByText('Wprowadź PIN Sejfu')).toBeTruthy();

      fireEvent.press(screen.getByText('4'));
      fireEvent.press(screen.getByText('3'));
      fireEvent.press(screen.getByText('2'));
      fireEvent.press(screen.getByText('1'));

      await waitFor(() => {
        expect(useVaultStore.getState().isUnlocked).toBe(true);
      });
    });

    test('wpisanie błędnego PIN-u wywołuje wibrację i czyści input', async () => {
      useVaultStore.setState({ pin: '4321', isBiometricsEnabled: false, isUnlocked: false });

      render(<VaultPinScreen />);

      fireEvent.press(screen.getByText('0'));
      fireEvent.press(screen.getByText('0'));
      fireEvent.press(screen.getByText('0'));
      fireEvent.press(screen.getByText('0'));

      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalled();
        expect(useVaultStore.getState().isUnlocked).toBe(false);
      });
    });

    test('przycisk biometrii wywołuje ponowne uwierzytelnienie biometryczne', async () => {
      useVaultStore.setState({ pin: '1234', isBiometricsEnabled: true, isUnlocked: false });

      render(<VaultPinScreen />);
      const bioBtn = screen.getByText('Użyj biometrii');
      fireEvent.press(bioBtn);

      await waitFor(() => {
        expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
      });
    });
  });

  describe('3. Modal resetowania zapomnianego PIN-u (Forgot PIN)', () => {
    beforeEach(() => {
      useVaultStore.setState({
        pin: '9999',
        isBiometricsEnabled: false,
        isUnlocked: false,
      });
    });

    test('dla gościa natychmiast resetuje PIN do stanu początkowego', async () => {
      useAuthStore.setState({
        user: { id: 'guest', email: 'guest@destivo.io', isGuest: true },
        isGuest: true,
      });

      render(<VaultPinScreen />);

      fireEvent.press(screen.getByText('Zapomniałeś PIN-u?'));

      // Przycisk resetowania dla gościa
      const resetBtn = screen.getByText('Zresetuj kod PIN ➔');
      fireEvent.press(resetBtn);

      await waitFor(() => {
        expect(useVaultStore.getState().pin).toBeNull();
        expect(alertSpy).toHaveBeenCalledWith(
          'Sukces',
          'Kod PIN został zresetowany. Możesz teraz ustawić nowy PIN.'
        );
      });
    });

    test('dla zalogowanego użytkownika wymaga hasła i resetuje PIN po poprawnym haśle', async () => {
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: 'u-1' } },
        error: null,
      });

      render(<VaultPinScreen />);

      fireEvent.press(screen.getByText('Zapomniałeś PIN-u?'));

      // Próba z pustym hasłem
      const resetBtn = screen.getByText('Zresetuj kod PIN ➔');
      fireEvent.press(resetBtn);
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', 'Wpisz hasło do konta');

      // Wpisanie poprawnego hasła
      const passwordInput = screen.getByPlaceholderText('Wpisz hasło do konta');
      fireEvent.changeText(passwordInput, 'MojeSuperTajneHaslo123');

      fireEvent.press(screen.getByText(/Zresetuj kod PIN/));

      await waitFor(() => {
        expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'vaultuser@destivo.io',
          password: 'MojeSuperTajneHaslo123',
        });
        expect(useVaultStore.getState().pin).toBeNull();
        expect(alertSpy).toHaveBeenCalledWith(
          'Sukces',
          'Kod PIN został zresetowany. Możesz teraz ustawić nowy PIN.'
        );
      });
    });

    test('dla zalogowanego użytkownika pokazuje błąd przy błędnym haśle', async () => {
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: new Error('Invalid login credentials'),
      });

      render(<VaultPinScreen />);

      fireEvent.press(screen.getByText('Zapomniałeś PIN-u?'));

      const passwordInput = screen.getByPlaceholderText('Wpisz hasło do konta');
      fireEvent.changeText(passwordInput, 'ZleHaslo');

      fireEvent.press(screen.getByText(/Zresetuj kod PIN/));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'DESTIVO',
          'Nieprawidłowe hasło do konta. Spróbuj ponownie.'
        );
        expect(useVaultStore.getState().pin).toBe('9999');
      });
    });

    test('wysyła link resetujący hasło do konta (handleSendAccountPasswordReset)', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({
        data: {},
        error: null,
      });

      render(<VaultPinScreen />);

      fireEvent.press(screen.getByText('Zapomniałeś PIN-u?'));

      const sendResetBtn = screen.getByText('Nie pamiętasz hasła? Wyślij link resetujący na e-mail');
      fireEvent.press(sendResetBtn);

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'vaultuser@destivo.io',
          { redirectTo: 'destivo://reset-password' }
        );
        expect(alertSpy).toHaveBeenCalledWith(
          'Sukces',
          'Link do zresetowania hasła został wysłany na Twój adres e-mail.'
        );
      });
    });
  });
});
