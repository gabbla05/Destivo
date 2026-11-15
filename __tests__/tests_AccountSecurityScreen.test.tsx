/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AccountSecurityScreen } from '../src/screens/AccountSecurityScreen';
import { useAuthStore } from '../src/store/authStore';
import { useVaultStore } from '../src/store/vaultStore';
import { VaultManager } from '../src/lib/vaultManager';
import { setVaultTestState } from '../test-shims/vaultTestUtils';
import { supabase } from '../src/lib/supabase';
import { translations } from '../src/i18n/translations';

const mockGoBack = jest.fn();
const mockNavigation = {
  goBack: mockGoBack,
};

const mockDisconnectAndClear = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    disconnectAndClear: mockDisconnectAndClear,
  }),
}));

const mockResetPasswordForEmail = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockInvoke = jest.fn();

const mockWipeLocalUserData = jest.fn();
jest.mock('../src/lib/localDataWipe', () => ({
  wipeLocalUserData: (...args: any[]) => mockWipeLocalUserData(...args),
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
    from: jest.fn(() => ({
      delete: mockDelete,
    })),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

describe('AccountSecurityScreen - Bezpieczeństwo i Zarządzanie Kontem', () => {
  const t = translations.pl.accountSecurity;

  beforeEach(async () => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'user-sec-1', email: 'jan@destivo.io', name: 'Jan' } as any,
      language: 'pl',
      isGuest: false,
    });
    await setVaultTestState({
      pin: '1234',
      isUnlocked: true,
    });
  });

  test('renderuje nagłówek, przycisk powrotu i sekcje ekranu', () => {
    render(<AccountSecurityScreen navigation={mockNavigation} />);

    expect(screen.getByText(t.title)).toBeTruthy();
    expect(screen.getByText(t.accountManagement)).toBeTruthy();
    expect(screen.getByText(t.resetPassword)).toBeTruthy();
    expect(screen.getByText(t.resetVaultPin)).toBeTruthy();
    expect(screen.getByText(t.privacyData)).toBeTruthy();
    expect(screen.getByText(t.privacyPolicy)).toBeTruthy();
    expect(screen.getByText(t.danger)).toBeTruthy();
    expect(screen.getByText(t.deleteData)).toBeTruthy();
    expect(screen.getByText(t.deleteAccount)).toBeTruthy();

    const backBtn = screen.getByText('arrow-back');
    fireEvent.press(backBtn);
    expect(mockGoBack).toHaveBeenCalled();
  });

  test('reset hasła wysyła zapytanie do Supabase i wyświetla komunikat sukcesu', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetPassword));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io', {
        redirectTo: 'destivo://reset-password',
      });
      expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.resetSuccess);
    });
  });

  test('reset hasła wyświetla komunikat błędu gdy Supabase zwróci błąd', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      error: { message: 'Błąd sieci Supabase' },
    });
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetPassword));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io', {
        redirectTo: 'destivo://reset-password',
      });
      expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, 'Błąd sieci Supabase');
    });
  });

  test('reset hasła wyświetla domyślny błąd gdy błąd nie ma message', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      error: {},
    });
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetPassword));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io', {
        redirectTo: 'destivo://reset-password',
      });
      expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.resetError);
    });
  });

  test('reset hasła nic nie robi, gdy użytkownik nie ma adresu e-mail', async () => {
    useAuthStore.setState({
      user: { id: 'guest-1', name: 'Gość' } as any,
    });

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetPassword));

    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  test('dla zalogowanego użytkownika resetowanie PIN-u sejfu wymaga podania hasła i sprawdza je w Supabase', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    // Kliknięcie w reset PIN-u
    fireEvent.press(screen.getByText(t.resetVaultPin));

    // Otwiera modal z polem hasła
    const input = screen.getByTestId('vault-reset-password-input');
    expect(input).toBeTruthy();

    fireEvent.changeText(input, 'mojeSekretneHaslo123');

    const confirmBtn = screen.getByTestId('vault-confirm-reset-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'jan@destivo.io',
        password: 'mojeSekretneHaslo123',
      });
      expect(useVaultStore.getState().hasPin).toBe(false);
      expect(useVaultStore.getState().isUnlocked).toBe(false);
      expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.vaultPinResetDone);
    });
  });

  test('nieprawidłowe hasło blokuje reset PIN-u i wyświetla błąd', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockSignInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetVaultPin));

    const input = screen.getByTestId('vault-reset-password-input');
    fireEvent.changeText(input, 'zleHaslo');

    const confirmBtn = screen.getByTestId('vault-confirm-reset-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'jan@destivo.io',
        password: 'zleHaslo',
      });
      // PIN nie może zostać skasowany!
      expect(useVaultStore.getState().hasPin).toBe(true);
      expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.wrongPassword || expect.any(String));
    });
  });

  test('dla gościa resetowanie PIN-u sejfu wyświetla ostrzeżenie i pozwala zresetować', async () => {
    useAuthStore.setState({
      user: { id: 'guest-1', isGuest: true } as any,
      isGuest: true,
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const wipeSpy = jest.spyOn(VaultManager, 'wipeVault').mockResolvedValue(undefined);

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetVaultPin));

    expect(alertSpy).toHaveBeenCalledWith(
      t.resetVaultPinTitle,
      expect.stringContaining('gość'),
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirmBtn = buttons.find((b) => b.text === t.resetVaultPinBtn);
    expect(confirmBtn).toBeTruthy();

    await confirmBtn.onPress();

    expect(useVaultStore.getState().hasPin).toBe(false);
    expect(wipeSpy).toHaveBeenCalled();
    wipeSpy.mockRestore();
    expect(useVaultStore.getState().isUnlocked).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.vaultPinResetDone);
  });

  test('polityka prywatności wyświetla Alert z treścią', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.privacyPolicy));

    expect(alertSpy).toHaveBeenCalledWith(t.privacyPolicy, t.privacyText);
  });

  const pressAlertButton = async (alertSpy: jest.SpyInstance, callIndex: number, label: string) => {
    const buttons = alertSpy.mock.calls[callIndex][2] as any[];
    const btn = buttons.find((b) => b.text === label);
    expect(btn).toBeTruthy();
    await act(async () => {
      await btn.onPress();
    });
  };

  describe('P3: "Usuń moje dane"', () => {
    test('usuwa podróże z chmury, czyści telefon i NIE wylogowuje', async () => {
      mockEq.mockResolvedValueOnce({ error: null });
      mockWipeLocalUserData.mockResolvedValueOnce(undefined);
      const logoutSpy = jest.fn();
      useAuthStore.setState({ logout: logoutSpy });
      const alertSpy = jest.spyOn(Alert, 'alert');

      render(<AccountSecurityScreen navigation={mockNavigation} />);
      fireEvent.press(screen.getByTestId('delete-data-row'));

      expect(alertSpy).toHaveBeenCalledWith(t.deleteDataTitle, t.deleteDataMessage, expect.any(Array));
      await pressAlertButton(alertSpy, 0, t.deleteDataConfirm);

      expect(supabase.from).toHaveBeenCalledWith('trips');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-sec-1');
      expect(mockWipeLocalUserData).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.deleteDataDone);
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    test('błąd chmury: nic nie jest czyszczone lokalnie, użytkownik widzi komunikat', async () => {
      mockEq.mockResolvedValueOnce({ error: { message: 'network' } });
      const alertSpy = jest.spyOn(Alert, 'alert');

      render(<AccountSecurityScreen navigation={mockNavigation} />);
      fireEvent.press(screen.getByTestId('delete-data-row'));
      await pressAlertButton(alertSpy, 0, t.deleteDataConfirm);

      expect(mockWipeLocalUserData).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.deleteDataError);
    });

    test('brak sieci (wyjątek) też blokuje czyszczenie lokalne', async () => {
      mockEq.mockRejectedValueOnce(new Error('Network request failed'));
      const alertSpy = jest.spyOn(Alert, 'alert');

      render(<AccountSecurityScreen navigation={mockNavigation} />);
      fireEvent.press(screen.getByTestId('delete-data-row'));
      await pressAlertButton(alertSpy, 0, t.deleteDataConfirm);

      expect(mockWipeLocalUserData).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.deleteDataError);
    });

    test('gość: widzi tylko "Usuń moje dane", czyszczony jest tylko telefon', async () => {
      useAuthStore.setState({ user: { id: 'guest-1', isGuest: true } as any, isGuest: true });
      mockWipeLocalUserData.mockResolvedValueOnce(undefined);
      const alertSpy = jest.spyOn(Alert, 'alert');

      render(<AccountSecurityScreen navigation={mockNavigation} />);
      expect(screen.queryByTestId('delete-account-row')).toBeNull();

      fireEvent.press(screen.getByTestId('delete-data-row'));
      expect(alertSpy).toHaveBeenCalledWith(t.deleteDataTitle, t.deleteDataGuestMessage, expect.any(Array));
      await pressAlertButton(alertSpy, 0, t.deleteDataConfirm);

      expect(supabase.from).not.toHaveBeenCalled();
      expect(mockWipeLocalUserData).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.deleteDataDone);
    });
  });

  describe('P3: "Usuń konto"', () => {
    const startAccountDeletion = async (alertSpy: jest.SpyInstance, password = 'mojeHaslo') => {
      render(<AccountSecurityScreen navigation={mockNavigation} />);
      fireEvent.press(screen.getByTestId('delete-account-row'));
      expect(alertSpy).toHaveBeenCalledWith(t.deleteTitle, t.deleteMessage, expect.any(Array));
      await pressAlertButton(alertSpy, 0, t.deleteConfirm);

      expect(screen.getByText(t.deleteAccountPasswordTitle)).toBeTruthy();
      fireEvent.changeText(screen.getByTestId('vault-reset-password-input'), password);
      fireEvent.press(screen.getByTestId('vault-confirm-reset-btn'));
    };

    test('po haśle wywołuje Edge Function, czyści telefon i wylogowuje', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({ error: null });
      mockInvoke.mockResolvedValueOnce({ data: { deleted: true }, error: null });
      mockWipeLocalUserData.mockResolvedValueOnce(undefined);
      mockDisconnectAndClear.mockResolvedValueOnce(undefined);
      mockSignOut.mockResolvedValueOnce({ error: null });
      const logoutSpy = jest.fn();
      useAuthStore.setState({ logout: logoutSpy });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await startAccountDeletion(alertSpy);

      await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'jan@destivo.io', password: 'mojeHaslo' });
      expect(mockInvoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
      expect(mockWipeLocalUserData).toHaveBeenCalled();
      expect(mockDisconnectAndClear).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      // PIN Sejfu NIE jest resetowany ścieżką resetu PIN-u (czyści go wipeLocalUserData)
      expect(alertSpy).not.toHaveBeenCalledWith(t.successTitle, t.vaultPinResetDone);
    });

    test('błąd Edge Function: brak wylogowania i czyszczenia, komunikat błędu', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({ error: null });
      mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('FunctionsHttpError') });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logoutSpy = jest.fn();
      useAuthStore.setState({ logout: logoutSpy });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await startAccountDeletion(alertSpy);

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.deleteError));
      expect(mockWipeLocalUserData).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(logoutSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('brak sieci przy wywołaniu funkcji: konto zostaje, użytkownik zalogowany', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({ error: null });
      mockInvoke.mockRejectedValueOnce(new Error('Network request failed'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logoutSpy = jest.fn();
      useAuthStore.setState({ logout: logoutSpy });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await startAccountDeletion(alertSpy);

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.deleteError));
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(mockWipeLocalUserData).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('złe hasło: funkcja usuwania nie jest wywoływana', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await startAccountDeletion(alertSpy, 'zleHaslo');

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.wrongPassword));
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockWipeLocalUserData).not.toHaveBeenCalled();
    });
  });
});
