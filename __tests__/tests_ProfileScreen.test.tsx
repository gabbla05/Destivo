/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { useAuthStore } from '../src/store/authStore';
import { supabase } from '../src/lib/supabase';
import { translations } from '../src/i18n/translations';

const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

const mockDisconnectAndClear = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    disconnectAndClear: mockDisconnectAndClear,
  }),
}));

const mockSignOut = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: any[]) => mockSignOut(...args),
    },
  },
}));

describe('ProfileScreen - Profil Użytkownika i Ustawienia', () => {
  const t = translations.pl.profile;
  const commonT = translations.pl.common;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'user-prof-1', email: 'anna@destivo.io', name: 'Anna' } as any,
      language: 'pl',
      isGuest: false,
    });
  });

  test('renderuje dane zalogowanego użytkownika (inicjał, imię, email, status synchronizacji)', () => {
    render(<ProfileScreen navigation={mockNavigation} />);

    expect(screen.getByText(t.title)).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy(); // Inicjał z Anna
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByText('anna@destivo.io')).toBeTruthy();
    expect(screen.getByText(t.synced)).toBeTruthy();
  });

  test('renderuje widok dla języka angielskiego (EN)', () => {
    useAuthStore.setState({
      user: { id: 'user-en-1', email: 'john@destivo.io', name: 'John' } as any,
      language: 'en',
    });

    render(<ProfileScreen navigation={mockNavigation} />);

    expect(screen.getByText('Your Profile')).toBeTruthy();
    expect(screen.getByText('Synchronized')).toBeTruthy();
  });

  test('renderuje ikonę person gdy użytkownik nie ma podanego imienia', () => {
    useAuthStore.setState({
      user: { id: 'user-guest-1', email: 'guest@destivo.io' } as any,
    });

    render(<ProfileScreen navigation={mockNavigation} />);

    expect(screen.getByText(t.userFallback)).toBeTruthy();
    expect(screen.getByText('person')).toBeTruthy();
  });

  test('przełączanie języka zmienia język w store (PL / EN)', () => {
    const setLanguageSpy = jest.fn();
    useAuthStore.setState({ setLanguage: setLanguageSpy });

    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText('EN'));
    expect(setLanguageSpy).toHaveBeenCalledWith('en');

    fireEvent.press(screen.getByText('PL'));
    expect(setLanguageSpy).toHaveBeenCalledWith('pl');
  });

  test('kliknięcie Sejf nawiguje do ekranu Vault', () => {
    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.vault));
    expect(mockNavigate).toHaveBeenCalledWith('Vault');
  });

  test('kliknięcie Bezpieczeństwo nawiguje do AccountSecurity', () => {
    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.security));
    expect(mockNavigate).toHaveBeenCalledWith('AccountSecurity');
  });

  test('wylogowanie pyta o potwierdzenie, rozłącza PowerSync, wylogowuje z Supabase i czyści stan', async () => {
    mockDisconnectAndClear.mockResolvedValueOnce(undefined);
    mockSignOut.mockResolvedValueOnce({ error: null });
    const logoutSpy = jest.fn();
    useAuthStore.setState({ logout: logoutSpy });

    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.logout));

    expect(alertSpy).toHaveBeenCalledWith(
      t.logoutTitle,
      t.logoutMessage,
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirmBtn = buttons.find((b) => b.text === t.logoutConfirm);
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      await confirmBtn.onPress();
    });

    expect(mockDisconnectAndClear).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(logoutSpy).toHaveBeenCalled();
  });

  test('wyświetla wskaźnik ładowania podczas trwania wylogowania', async () => {
    let resolveDisconnect: any;
    mockDisconnectAndClear.mockImplementationOnce(() => new Promise((resolve) => { resolveDisconnect = resolve; }));
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.logout));

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirmBtn = buttons.find((b) => b.text === t.logoutConfirm);

    act(() => {
      confirmBtn.onPress();
    });

    // Wskaźnik ładowania powinien być widoczny
    expect(screen.queryByText(t.logout)).toBeNull();

    await act(async () => {
      resolveDisconnect();
    });
  });

  test('błąd podczas wylogowania wyświetla alert z błędem', async () => {
    mockDisconnectAndClear.mockRejectedValueOnce(new Error('Błąd PowerSync'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(screen.getByText(t.logout));

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const confirmBtn = buttons.find((b) => b.text === t.logoutConfirm);

    await act(async () => {
      await confirmBtn.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(commonT.label_error, t.logoutError);
  });
});
