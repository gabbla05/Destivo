/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AccountSecurityScreen } from '../src/screens/AccountSecurityScreen';
import { useAuthStore } from '../src/store/authStore';
import { useVaultStore } from '../src/store/vaultStore';
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
const mockSignOut = jest.fn();
const mockEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockEq }));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
    from: jest.fn(() => ({
      delete: mockDelete,
    })),
  },
}));

describe('AccountSecurityScreen - Bezpieczeństwo i Zarządzanie Kontem', () => {
  const t = translations.pl.accountSecurity;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'user-sec-1', email: 'jan@destivo.io', name: 'Jan' } as any,
      language: 'pl',
      isGuest: false,
    });
    useVaultStore.setState({
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
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io');
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
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io');
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
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('jan@destivo.io');
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

  test('resetowanie PIN-u sejfu pyta o potwierdzenie i czyści stan PIN-u', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.resetVaultPin));

    expect(alertSpy).toHaveBeenCalledWith(
      t.resetVaultPinTitle,
      t.resetVaultPinConfirm,
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirmBtn = buttons.find((b) => b.text === t.resetVaultPinBtn);
    expect(confirmBtn).toBeTruthy();

    confirmBtn.onPress();

    expect(useVaultStore.getState().pin).toBeNull();
    expect(useVaultStore.getState().isUnlocked).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(t.successTitle, t.vaultPinResetDone);
  });

  test('polityka prywatności wyświetla Alert z treścią', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.privacyPolicy));

    expect(alertSpy).toHaveBeenCalledWith(t.privacyPolicy, t.privacyText);
  });

  test('usuwanie konta pyta o potwierdzenie, usuwa dane z Supabase, czyści PowerSync i wylogowuje', async () => {
    mockEq.mockResolvedValueOnce({ error: null });
    mockDisconnectAndClear.mockResolvedValueOnce(undefined);
    mockSignOut.mockResolvedValueOnce({ error: null });
    const logoutSpy = jest.fn();
    useAuthStore.setState({ logout: logoutSpy });

    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.deleteAccount));

    expect(alertSpy).toHaveBeenCalledWith(
      t.deleteTitle,
      t.deleteMessage,
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const deleteBtn = buttons.find((b) => b.text === t.deleteConfirm);
    expect(deleteBtn).toBeTruthy();

    await deleteBtn.onPress();

    expect(supabase.from).toHaveBeenCalledWith('trips');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-sec-1');
    expect(mockDisconnectAndClear).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(logoutSpy).toHaveBeenCalled();
  });

  test('błąd podczas usuwania konta wyświetla alert z błędem', async () => {
    mockEq.mockRejectedValueOnce(new Error('Błąd usuwania w chmurze'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<AccountSecurityScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.deleteAccount));

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const deleteBtn = buttons.find((b) => b.text === t.deleteConfirm);

    await deleteBtn.onPress();

    expect(alertSpy).toHaveBeenCalledWith(t.errorTitle, t.deleteError);
  });
});
