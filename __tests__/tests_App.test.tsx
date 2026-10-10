/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';
import App from '../App';
import { useAuthStore } from '../src/store/authStore';

// Mock ekranów i nawigatorów dla izolacji testu App.tsx
jest.mock('../src/screens/auth/WelcomeScreen', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    WelcomeScreen: ({ onNavigateToAuth }: any) =>
      React.createElement(
        TouchableOpacity,
        {
          testID: 'welcome-screen-login-btn',
          onPress: () => onNavigateToAuth('login'),
        },
        React.createElement(Text, null, 'WelcomeScreen')
      ),
  };
});

jest.mock('../src/screens/auth/LoginRegisterScreen', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    LoginRegisterScreen: ({ initialMode, onBack, onSuccess }: any) =>
      React.createElement(
        View,
        null,
        React.createElement(
          TouchableOpacity,
          {
            testID: 'auth-screen-back-btn',
            onPress: onBack,
          },
          React.createElement(Text, null, `LoginRegisterScreen mode: ${initialMode}`)
        ),
        React.createElement(
          TouchableOpacity,
          {
            testID: 'auth-screen-success-btn',
            onPress: onSuccess,
          },
          React.createElement(Text, null, 'Success')
        )
      ),
  };
});

jest.mock('../src/navigation/BottomTabNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    BottomTabNavigator: () => React.createElement(Text, { testID: 'mock-bottom-tabs' }, 'BottomTabNavigator'),
  };
});

jest.mock('../src/navigation/TripCreatorNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TripCreatorNavigator: () => React.createElement(Text, null, 'TripCreatorNavigator'),
  };
});

describe('App.tsx - Główny kontener aplikacji i sterowanie sesją', () => {
  let urlListenerCallback: ((event: { url: string }) => void) | null = null;
  const mockRemoveListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isGuest: false,
    });

    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockImplementation((event: string, handler: any) => {
      urlListenerCallback = handler;
      return { remove: mockRemoveListener } as any;
    });
  });

  test('renderuje WelcomeScreen dla niezalogowanego użytkownika domyślnie', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('WelcomeScreen')).toBeTruthy();
    });
  });

  test('przejście z WelcomeScreen do ekranu logowania otwiera LoginRegisterScreen w trybie login', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('WelcomeScreen')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('welcome-screen-login-btn'));

    expect(screen.getByText('LoginRegisterScreen mode: login')).toBeTruthy();

    // Kliknięcie Powrót na ekranie logowania wraca do WelcomeScreen
    fireEvent.press(screen.getByTestId('auth-screen-back-btn'));
    expect(screen.getByText('WelcomeScreen')).toBeTruthy();

    // Ponowne wejście i wywołanie onSuccess
    fireEvent.press(screen.getByTestId('welcome-screen-login-btn'));
    fireEvent.press(screen.getByTestId('auth-screen-success-btn'));
  });

  test('zalogowany użytkownik (user) przełącza aplikację do MainTabs (RootStack)', async () => {
    useAuthStore.setState({
      user: { id: 'u-1', email: 'user@destivo.io', name: 'Marek' } as any,
      isGuest: false,
    });

    render(<App />);

    expect(screen.getByTestId('mock-bottom-tabs')).toBeTruthy();
  });

  test('gość (isGuest: true) również ma dostęp do MainTabs (RootStack)', async () => {
    useAuthStore.setState({
      user: null,
      isGuest: true,
    });

    render(<App />);

    expect(screen.getByTestId('mock-bottom-tabs')).toBeTruthy();
  });

  test('deep linking z destivo:// przy starcie aplikacji otwiera ekran logowania', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('destivo://auth/callback');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('LoginRegisterScreen mode: login')).toBeTruthy();
    });
  });

  test('zdarzenie deep linku w trakcie działania aplikacji przełącza ekran na logowanie', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('WelcomeScreen')).toBeTruthy();
    });

    act(() => {
      urlListenerCallback?.({ url: 'destivo://reset-password' });
    });

    expect(screen.getByText('LoginRegisterScreen mode: login')).toBeTruthy();
  });

  test('zdarzenie deep linku z innym protokołem (np. https://) nie zmienia ekranu', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('WelcomeScreen')).toBeTruthy();
    });

    act(() => {
      urlListenerCallback?.({ url: 'https://destivo.app' });
    });

    expect(screen.getByText('WelcomeScreen')).toBeTruthy();
  });
});
