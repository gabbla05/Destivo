/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { BottomTabNavigator } from '../src/navigation/BottomTabNavigator';
import { TripCreatorNavigator } from '../src/navigation/TripCreatorNavigator';
import { useAuthStore } from '../src/store/authStore';
import { translations } from '../src/i18n/translations';

jest.mock('../src/screens/HomeScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    HomeScreen: () => React.createElement(Text, { testID: 'mock-home-screen' }, 'HomeScreen'),
  };
});
jest.mock('../src/screens/TripsListScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TripsListScreen: () => React.createElement(Text, { testID: 'mock-trips-list-screen' }, 'TripsListScreen'),
  };
});
jest.mock('../src/screens/TimelineScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TimelineScreen: () => React.createElement(Text, { testID: 'mock-timeline-screen' }, 'TimelineScreen'),
  };
});
jest.mock('../src/screens/Vault/VaultScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    VaultScreen: () => React.createElement(Text, { testID: 'mock-vault-screen' }, 'VaultScreen'),
  };
});
jest.mock('../src/screens/ProfileScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ProfileScreen: () => React.createElement(Text, { testID: 'mock-profile-screen' }, 'ProfileScreen'),
  };
});
jest.mock('../src/screens/AccountSecurityScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    AccountSecurityScreen: () => React.createElement(Text, { testID: 'mock-security-screen' }, 'AccountSecurityScreen'),
  };
});

jest.mock('../src/screens/TripCreator/Step1DestinationScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Step1DestinationScreen: () => React.createElement(Text, { testID: 'mock-step1-screen' }, 'Step1DestinationScreen'),
  };
});
jest.mock('../src/screens/TripCreator/Step2TransportScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Step2TransportScreen: (props: any) =>
      React.createElement(Text, { testID: 'mock-step2-screen' }, `hasProvider: ${Boolean(props.transportProvider)}`),
  };
});
jest.mock('../src/screens/TripCreator/Step3LodgingScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Step3LodgingScreen: () => React.createElement(Text, { testID: 'mock-step3-screen' }, 'Step3LodgingScreen'),
  };
});
jest.mock('../src/screens/TripCreator/Step4AttractionsScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Step4AttractionsScreen: () => React.createElement(Text, { testID: 'mock-step4-screen' }, 'Step4AttractionsScreen'),
  };
});

describe('Nawigacja Destivo - BottomTabNavigator & TripCreatorNavigator', () => {
  const t = translations.pl.bottomTab;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'user-nav-1', email: 'test@destivo.io', name: 'Tester' } as any,
      language: 'pl',
      isGuest: false,
    });
  });

  describe('1. BottomTabNavigator', () => {
    test('renderuje wszystkie 4 zakładki dolnego paska nawigacji (Explore, Trips, Vault, Profile)', () => {
      render(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );

      expect(screen.getByText(t.tab_explore)).toBeTruthy();
      expect(screen.getByText(t.tab_trips)).toBeTruthy();
      expect(screen.getByText(t.tab_vault)).toBeTruthy();
      expect(screen.getByText(t.tab_profile)).toBeTruthy();
      expect(screen.getByTestId('mock-home-screen')).toBeTruthy();
    });

    test('przejście na zakładkę Trips renderuje TripsListScreen ze stosu TripsStack', async () => {
      render(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );

      fireEvent.press(screen.getByText(t.tab_trips));

      expect(await screen.findByTestId('mock-trips-list-screen')).toBeTruthy();
    });

    test('przejście na zakładkę Vault renderuje VaultScreen', async () => {
      render(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );

      fireEvent.press(screen.getByText(t.tab_vault));

      expect(await screen.findByTestId('mock-vault-screen')).toBeTruthy();
    });

    test('zalogowany użytkownik może swobodnie przejść do zakładki Profil', async () => {
      render(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );

      fireEvent.press(screen.getByText(t.tab_profile));

      expect(await screen.findByTestId('mock-profile-screen')).toBeTruthy();
    });

    test('gość (isGuest: true) próbuje wejść w Profil: wyświetla Alert z blokadą i pozwala przejść do logowania', async () => {
      const logoutSpy = jest.fn();
      useAuthStore.setState({
        isGuest: true,
        logout: logoutSpy,
      });

      const alertSpy = jest.spyOn(Alert, 'alert');

      render(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );

      fireEvent.press(screen.getByText(t.tab_profile));

      expect(alertSpy).toHaveBeenCalledWith(
        t.guestAlertTitle,
        t.guestAlertMessage,
        expect.any(Array)
      );

      const buttons = alertSpy.mock.calls[0][2] as any[];
      const loginBtn = buttons.find((b) => b.text === t.guestAlertLogin);
      expect(loginBtn).toBeTruthy();

      loginBtn.onPress();
      expect(logoutSpy).toHaveBeenCalled();
    });
  });

  describe('2. TripCreatorNavigator', () => {
    test('renderuje stos kreatora podróży ze Step1DestinationScreen jako ekran startowy', () => {
      render(
        <NavigationContainer>
          <TripCreatorNavigator />
        </NavigationContainer>
      );

      expect(screen.getByTestId('mock-step1-screen')).toBeTruthy();
    });

    test('przejście do Step2Transport przekazuje supabaseTransportProvider', async () => {
      const navigationRef = React.createRef<any>();

      render(
        <NavigationContainer ref={navigationRef}>
          <TripCreatorNavigator />
        </NavigationContainer>
      );

      act(() => {
        navigationRef.current?.navigate('Step2Transport');
      });

      expect(await screen.findByText('hasProvider: true')).toBeTruthy();
    });
  });
});
