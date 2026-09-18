/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { WelcomeScreen } from '../src/screens/auth/WelcomeScreen';
import { useAuthStore } from '../src/store/authStore';

const mockContinueAsGuest = jest.fn();

jest.mock('../src/store/authStore', () => ({
  useAuthStore: jest.fn(),
}));

describe('WelcomeScreen - Rygorystyczny zestaw testów', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      continueAsGuest: mockContinueAsGuest,
      language: 'pl',
    });
  });

  test('1. powinien poprawnie wyrenderować logo, podtytuły i wszystkie 3 przyciski w języku polskim', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText('Zarejestruj się ➔')).toBeTruthy();
    expect(screen.getByText('Zaloguj się')).toBeTruthy();
    expect(screen.getByText('KONTYNUUJ JAKO GOŚĆ')).toBeTruthy();
    expect(screen.getByText('Inteligentny asystent dla')).toBeTruthy();
    expect(screen.getByText('Twoich podróży.')).toBeTruthy();
  });

  test('2. powinien poprawnie wyrenderować teksty po angielsku przy wybranym języku EN', () => {
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      continueAsGuest: mockContinueAsGuest,
      language: 'en',
    });

    render(<WelcomeScreen />);

    expect(screen.getByText('Get Started ➔')).toBeTruthy();
    expect(screen.getByText('Log In')).toBeTruthy();
    expect(screen.getByText('CONTINUE AS GUEST')).toBeTruthy();
    expect(screen.getByText('Precision engineering for')).toBeTruthy();
    expect(screen.getByText('your journeys.')).toBeTruthy();
  });

  test('3. powinien wywołać onNavigateToAuth("register") po kliknięciu rejestracji', () => {
    const mockNavigate = jest.fn();
    render(<WelcomeScreen onNavigateToAuth={mockNavigate} />);

    fireEvent.press(screen.getByText('Zarejestruj się ➔'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('register');
  });

  test('4. powinien wywołać onNavigateToAuth("login") po kliknięciu logowania', () => {
    const mockNavigate = jest.fn();
    render(<WelcomeScreen onNavigateToAuth={mockNavigate} />);

    fireEvent.press(screen.getByText('Zaloguj się'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('login');
  });

  test('5. powinien wywołać continueAsGuest po kliknięciu kontynuacji jako gość', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByText('KONTYNUUJ JAKO GOŚĆ'));

    expect(mockContinueAsGuest).toHaveBeenCalledTimes(1);
  });

  test('6. [Przypadek brzegowy] nie powinien rzucać błędu, jeśli onNavigateToAuth nie zostało przekazane', () => {
    expect(() => {
      render(<WelcomeScreen />);
      fireEvent.press(screen.getByText('Zarejestruj się ➔'));
      fireEvent.press(screen.getByText('Zaloguj się'));
    }).not.toThrow();
  });
});
