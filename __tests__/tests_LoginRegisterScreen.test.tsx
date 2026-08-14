/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { LoginRegisterScreen } from '../src/screens/auth/LoginRegisterScreen';

const mockSetUser = jest.fn();
const mockSetLanguage = jest.fn();
const mockContinueAsGuest = jest.fn();
const mockLogout = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    isGuest: false,
    language: 'pl',
    setLanguage: mockSetLanguage,
    setUser: mockSetUser,
    continueAsGuest: mockContinueAsGuest,
    logout: mockLogout,
  }),
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (creds: { email: string; password: string }) => mockSignInWithPassword(creds),
      signUp: (creds: any) => mockSignUp(creds),
    },
  },
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => null);

describe('LoginRegisterScreen - Kompletny zestaw testów', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
    mockSignUp.mockResolvedValue({ data: { user: null }, error: null });
  });

  test('1. powinien poprawnie wyrenderować ekran w domyślnym trybie rejestracji i pokazać wybór języka', () => {
    render(<LoginRegisterScreen />);

    expect(screen.getByText('Utwórz konto')).toBeTruthy();
    expect(screen.getByPlaceholderText('odkrywca@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeTruthy();
    expect(screen.getByText('PL')).toBeTruthy();
    expect(screen.getByText('EN')).toBeTruthy();
  });

  test('2. powinien wywołać zmianę języka po kliknięciu przycisku EN w formularzu rejestracji', () => {
    render(<LoginRegisterScreen />);

    fireEvent.press(screen.getByText('EN'));

    expect(mockSetLanguage).toHaveBeenCalledWith('en');
  });

  test('3. powinien przełączyć ekran w tryb logowania po kliknięciu przycisku zmiany trybu', () => {
    render(<LoginRegisterScreen />);

    fireEvent.press(screen.getByText(/ZALOGUJ SIĘ/i));

    expect(screen.getByText('Zaloguj się ➔')).toBeTruthy();
    expect(screen.queryByText('Utwórz konto ➔')).toBeNull();
  });

  test('4. nie powinien wysyłać zapytania, jeśli pola są puste w formularzu rejestracyjnym', async () => {
    render(<LoginRegisterScreen />);

    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  test('5. powinien wywołać signIn z poprawnymi danymi po przełączeniu na logowanie i zapisać wybrany język', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'user-id', email: 'test@destivo.pl', user_metadata: { language: 'en' } } }, error: null });

    render(<LoginRegisterScreen />);
    fireEvent.press(screen.getByText('EN'));
    fireEvent.press(screen.getByText(/ZALOGUJ SIĘ/i));

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'test@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'TajneHaslo123');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'test@destivo.pl', password: 'TajneHaslo123' });
      expect(mockSetLanguage).toHaveBeenCalledWith('en');
      expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-id', email: 'test@destivo.pl', isGuest: false, language: 'en' });
    });
  });

  test('6. powinien wywołać signUp z językiem w metadatach po wypełnieniu formularza rejestracyjnego', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'new-user-id', email: 'nowy@destivo.pl' } }, error: null });

    render(<LoginRegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Jan Kowalski'), 'Nowy Użytkownik');
    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'nowy@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'NoweHaslo123');
    fireEvent.press(screen.getByText(/Akceptuję Politykę Prywatności/i));
    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledTimes(1);
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'nowy@destivo.pl',
        password: 'NoweHaslo123',
        options: {
          data: { full_name: 'Nowy Użytkownik', language: 'pl' },
        },
      });
      expect(mockSetLanguage).toHaveBeenCalledWith('pl');
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'new-user-id',
        email: 'nowy@destivo.pl',
        isGuest: false,
        name: 'Nowy Użytkownik',
        language: 'pl',
      });
      expect(screen.getByText('Zaloguj się ➔')).toBeTruthy();
    });
  });

  test('7. powinien obsłużyć błąd logowania (np. pokazać Alert), gdy API zwróci błąd', async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new Error('Nieprawidłowe dane logowania'));

    render(<LoginRegisterScreen />);
    fireEvent.press(screen.getByText(/ZALOGUJ SIĘ/i));

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'test@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'ZleHaslo');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalled();
    });
  });
});