/// <reference types="jest" />
import React from 'react';
import { render } from '@testing-library/react-native';
import { ScrollView, KeyboardAvoidingView } from 'react-native';
import { LoginRegisterScreen } from '../src/screens/auth/LoginRegisterScreen';
import { Step1DestinationScreen } from '../src/screens/TripCreator/Step1DestinationScreen';
import { Step3LodgingScreen } from '../src/screens/TripCreator/Step3LodgingScreen';

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    isGuest: false,
    language: 'pl',
    setLanguage: jest.fn(),
    setUser: jest.fn(),
    continueAsGuest: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock('../src/store/tripCreatorStore', () => ({
  useTripCreatorStore: (selector?: (s: any) => any) => {
    const state = {
      destination: 'Rzym',
      lodgingAddress: '',
      setLodgingAddress: jest.fn(),
      setStep1Data: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

describe('Obsługa klawiatury i ScrollView - Dostęp do dolnej części ekranu', () => {
  test('1. LoginRegisterScreen musi zawierać KeyboardAvoidingView oraz ScrollView z keyboardShouldPersistTaps="handled"', () => {
    const { UNSAFE_getAllByType } = render(<LoginRegisterScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('2. Step1DestinationScreen musi zawierać KeyboardAvoidingView i ScrollView dla swobodnego wpisywania', () => {
    const { UNSAFE_getAllByType } = render(<Step1DestinationScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('3. Step3LodgingScreen musi zawierać KeyboardAvoidingView i ScrollView dla wpisywania adresu noclegu', () => {
    const { UNSAFE_getAllByType } = render(<Step3LodgingScreen />);

    const keyboardViews = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(keyboardViews.length).toBeGreaterThan(0);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled');
  });
});
