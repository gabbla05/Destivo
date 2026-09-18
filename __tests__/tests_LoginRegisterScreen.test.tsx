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
const mockResend = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCodeForSession = jest.fn();

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
      resend: (params: any) => mockResend(params),
      resetPasswordForEmail: (email: string, options?: any) => mockResetPasswordForEmail(email, options),
      verifyOtp: (params: any) => mockVerifyOtp(params),
      updateUser: (params: any) => mockUpdateUser(params),
      setSession: (session: any) => mockSetSession(session),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
    },
  },
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => null);

describe('LoginRegisterScreen - Kompletny zestaw surowych testów jednostkowych', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
    mockSignUp.mockResolvedValue({ data: { user: null }, error: null });
    mockResend.mockResolvedValue({ error: null });
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: 'u-1' }, session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
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

  test('4. [Walidacja] nie powinien wysyłać zapytania, jeśli pola są puste w formularzu rejestracyjnym', async () => {
    render(<LoginRegisterScreen />);

    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wypełnij wszystkie pola'));
  });

  test('5. [Walidacja] nie powinien pozwolić na rejestrację z hasłem krótszym niż 6 znaków', async () => {
    render(<LoginRegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Jan Kowalski'), 'Jan Kowalski');
    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'jan@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), '12345'); // 5 znaków
    fireEvent.press(screen.getByText(/Akceptuję Politykę Prywatności/i));

    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('co najmniej 6 znaków'));
  });

  test('6. [Walidacja] nie powinien pozwolić na rejestrację bez zaznaczenia regulaminu', async () => {
    render(<LoginRegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Jan Kowalski'), 'Jan Kowalski');
    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'jan@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'TajneHaslo123');
    // Nie zaznaczamy checkboxa regulaminu!

    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wypełnij wszystkie pola'));
  });

  test('7. [Walidacja] w trybie logowania wymaga podania emaila i hasła', async () => {
    render(<LoginRegisterScreen initialMode="login" />);

    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wypełnij wszystkie pola'));
  });

  test('8. powinien wywołać signIn z poprawnymi danymi po logowaniu i zapisać użytkownika', async () => {
    const mockUser = { id: 'user-123', email: 'test@destivo.pl', user_metadata: { language: 'pl', full_name: 'Jan Test' } };
    mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser }, error: null });

    const mockSuccess = jest.fn();
    render(<LoginRegisterScreen initialMode="login" onSuccess={mockSuccess} />);

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'test@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'DobreHaslo123');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'test@destivo.pl', password: 'DobreHaslo123' });
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@destivo.pl',
        isGuest: false,
        name: 'Jan Test',
        language: 'pl',
      });
      expect(mockSuccess).toHaveBeenCalled();
    });
  });

  test('9. [Weryfikacja Email] powinien obsłużyć błąd "Email not confirmed" i umożliwić ponowne wysłanie linku', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email not confirmed. Please verify your email before logging in.' },
    });

    render(<LoginRegisterScreen initialMode="login" />);

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'niepotwierdzony@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'Haslo123');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'DESTIVO',
        expect.stringContaining('nie został jeszcze potwierdzony'),
        expect.any(Array)
      );
    });

    const lastAlertCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const buttons = lastAlertCall[2] as any[];
    const resendBtn = buttons.find((b: any) => b.text && b.text.includes('Wyślij ponownie link'));
    expect(resendBtn).toBeDefined();

    // Symulujemy kliknięcie przycisku "Wyślij ponownie link"
    await resendBtn.onPress();

    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'niepotwierdzony@destivo.pl',
    });
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wysłano ponownie e-mail'));
  });

  test('10. [Weryfikacja Email] powinien obsłużyć błąd przy ponownym wysyłaniu linku weryfikacyjnego', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email not confirmed' },
    });
    mockResend.mockRejectedValueOnce(new Error('Rate limit exceeded. Try again in 60s.'));

    render(<LoginRegisterScreen initialMode="login" />);

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'limit@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'Haslo123');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const lastAlertCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const buttons = lastAlertCall[2] as any[];
    const resendBtn = buttons.find((b: any) => b.text && b.text.includes('Wyślij ponownie link'));

    await resendBtn.onPress();

    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', 'Rate limit exceeded. Try again in 60s.');
  });

  test('11. [Rejestracja z weryfikacją] przy braku sesji informuje o wysłaniu linku aktywacyjnego', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'new-id', email: 'link@destivo.pl' }, session: null },
      error: null,
    });

    render(<LoginRegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('np. Jan Kowalski'), 'Nowy Użytkownik');
    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'link@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'DobreHaslo123');
    fireEvent.press(screen.getByText(/Akceptuję Politykę Prywatności/i));
    fireEvent.press(screen.getByText('Utwórz konto ➔'));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wysłaliśmy link weryfikacyjny'));
      expect(screen.getByText('Zaloguj się ➔')).toBeTruthy(); // Przełącza w tryb logowania
    });
  });

  test('12. [Błąd sieci] informuje o problemie z połączeniem internetowym', async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new Error('Network request failed'));

    render(<LoginRegisterScreen initialMode="login" />);

    fireEvent.changeText(screen.getByPlaceholderText('odkrywca@example.com'), 'offline@destivo.pl');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••••••'), 'DobreHaslo123');
    fireEvent.press(screen.getByText('Zaloguj się ➔'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Błąd połączenia z serwerem'));
    });
  });

  test('13. [Zabezpieczenie hasła] przełącza widoczność hasła (secureTextEntry)', () => {
    render(<LoginRegisterScreen />);

    const passwordInput = screen.getByPlaceholderText('••••••••••••');
    expect(passwordInput.props.secureTextEntry).toBe(true);

    const toggleButton = screen.getByTestId('toggle-password-visibility');
    fireEvent.press(toggleButton);

    expect(passwordInput.props.secureTextEntry).toBe(false);

    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  test('14. [Strzałka cofania] kliknięcie przycisku wstecz wywołuje callback onBack', () => {
    const mockBack = jest.fn();
    render(<LoginRegisterScreen onBack={mockBack} />);

    const backBtn = screen.getByTestId('back-button');
    fireEvent.press(backBtn);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('15. [Forgot Password - Wysłanie linku] otwiera modal, waliduje pusty email i wysyła link resetujący', async () => {
    render(<LoginRegisterScreen initialMode="login" />);

    // Klikamy "Nie pamiętasz hasła?"
    fireEvent.press(screen.getByText(/Nie pamiętasz hasła\?/i));

    expect(screen.getByText('Zresetuj hasło')).toBeTruthy();

    // Próba wysłania bez wpisania maila
    fireEvent.press(screen.getByText(/Wyślij link do resetu/i));
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Wypełnij wszystkie pola'));

    // Wpisujemy poprawny email do modalu
    const inputs = screen.getAllByPlaceholderText('odkrywca@example.com');
    const modalEmailInput = inputs[inputs.length - 1];
    fireEvent.changeText(modalEmailInput, 'reset@destivo.pl');

    fireEvent.press(screen.getByText(/Wyślij link do resetu/i));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('reset@destivo.pl', {
        redirectTo: 'destivo://reset-password',
      });
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Link do zresetowania hasła został wysłany'));
      expect(screen.queryByText('Zresetuj hasło')).toBeNull(); // Modal zamknięty po wysłaniu
    });
  });

  test('16. [Forgot Password - Błąd wysyłania linku] obsługuje błąd API przy wysyłaniu linku', async () => {
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error('User not found'));

    render(<LoginRegisterScreen initialMode="login" />);

    fireEvent.press(screen.getByText(/Nie pamiętasz hasła\?/i));

    const inputs = screen.getAllByPlaceholderText('odkrywca@example.com');
    const modalEmailInput = inputs[inputs.length - 1];
    fireEvent.changeText(modalEmailInput, 'nieznany@destivo.pl');

    fireEvent.press(screen.getByText(/Wyślij link do resetu/i));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('nieznany@destivo.pl', {
        redirectTo: 'destivo://reset-password',
      });
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', 'User not found');
    });
  });

  test('17. [Forgot Password - Ustawianie hasła] waliduje minimalną długość hasła oraz zgodność haseł', async () => {
    const recoveryUrl = 'destivo://reset-password#access_token=valid_token&refresh_token=valid_refresh&type=recovery';
    render(<LoginRegisterScreen initialMode="login" initialRecoveryUrl={recoveryUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId('new-password-input')).toBeTruthy();
      expect(screen.getByTestId('confirm-password-input')).toBeTruthy();
    });

    // 1) Hasło < 6 znaków
    fireEvent.changeText(screen.getByTestId('new-password-input'), '12345');
    fireEvent.changeText(screen.getByTestId('confirm-password-input'), '12345');
    fireEvent.press(screen.getByTestId('submit-new-password-btn'));

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('co najmniej 6 znaków'));

    // 2) Niezgodność haseł
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'hasloPierwsze123');
    fireEvent.changeText(screen.getByTestId('confirm-password-input'), 'hasloInne456');
    fireEvent.press(screen.getByTestId('submit-new-password-btn'));

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('nie są identyczne'));
  });

  test('18. [Forgot Password - Sukces] aktualizuje hasło użytkownika i zamyka modal', async () => {
    const recoveryUrl = 'destivo://reset-password#access_token=token123&refresh_token=refresh123&type=recovery';
    render(<LoginRegisterScreen initialMode="login" initialRecoveryUrl={recoveryUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId('new-password-input')).toBeTruthy();
      expect(screen.getByTestId('confirm-password-input')).toBeTruthy();
      expect(screen.queryByTestId('otp-input')).toBeNull(); // Brak pola na kod!
    });

    fireEvent.changeText(screen.getByTestId('new-password-input'), 'SilneNoweHaslo123!');
    fireEvent.changeText(screen.getByTestId('confirm-password-input'), 'SilneNoweHaslo123!');
    fireEvent.press(screen.getByTestId('submit-new-password-btn'));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: 'SilneNoweHaslo123!',
      });
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', expect.stringContaining('Hasło zostało pomyślnie zmienione'));
      expect(screen.queryByText('Ustaw nowe hasło')).toBeNull(); // Modal zamknięty
    });
  });

  test('19. [Forgot Password - Obsługa błędów] poprawnie obsługuje błąd updateUser', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('Password is too weak'));

    const recoveryUrl = 'destivo://reset-password#access_token=token123&refresh_token=refresh123&type=recovery';
    render(<LoginRegisterScreen initialMode="login" initialRecoveryUrl={recoveryUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId('new-password-input')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('new-password-input'), 'slabehaslo');
    fireEvent.changeText(screen.getByTestId('confirm-password-input'), 'slabehaslo');
    fireEvent.press(screen.getByTestId('submit-new-password-btn'));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'slabehaslo' });
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', 'Password is too weak');
    });
  });

  test('20. [Forgot Password - Nawigacja i UI] pozwala na przełączanie podglądu hasła oraz zamknięcie modalu', async () => {
    const recoveryUrl = 'destivo://reset-password#access_token=token123&refresh_token=refresh123&type=recovery';
    render(<LoginRegisterScreen initialMode="login" initialRecoveryUrl={recoveryUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId('new-password-input')).toBeTruthy();
    });

    // Test podglądu hasła w modalu
    const newPassInput = screen.getByTestId('new-password-input');
    expect(newPassInput.props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByTestId('toggle-new-password-visibility'));
    expect(newPassInput.props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByTestId('toggle-new-password-visibility'));
    expect(newPassInput.props.secureTextEntry).toBe(true);

    // Zamknięcie modalu przyciskiem X
    fireEvent.press(screen.getByTestId('modal-close-button'));
    expect(screen.queryByText('Ustaw nowe hasło')).toBeNull();
  });
});