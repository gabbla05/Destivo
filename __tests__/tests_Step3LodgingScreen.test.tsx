/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking, Alert, Keyboard } from 'react-native';
import { Step3LodgingScreen } from '../src/screens/TripCreator/Step3LodgingScreen';
import { useTripCreatorStore } from '../src/store/tripCreatorStore';
import { useAuthStore } from '../src/store/authStore';
import { translations } from '../src/i18n/translations';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

describe('Step3LodgingScreen - Krok 3 Kreatora: Nocleg i Booking', () => {
  const t = translations.pl.tripCreatorStep3;
  const commonT = translations.pl.common;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ language: 'pl' });
    useTripCreatorStore.setState({
      destination: 'Rzym',
      lodgingAddress: '',
    });
  });

  test('renderuje nagłówek, pasek postępu (75%), kartę Booking i pole adresu', () => {
    render(<Step3LodgingScreen />);

    expect(screen.getByText(t.step_indicator)).toBeTruthy();
    expect(screen.getByText(t.step_title)).toBeTruthy();
    expect(screen.getByText(t.header_title)).toBeTruthy();
    expect(screen.getByText(t.booking_prompt_title)).toBeTruthy();
    expect(screen.getByText(t.button_openBooking)).toBeTruthy();
    expect(screen.getByText(commonT.button_nextStep)).toBeTruthy();
    expect(screen.getByText(commonT.button_goBack)).toBeTruthy();
    expect(screen.getByText(commonT.button_skip)).toBeTruthy();
  });

  test('kliknięcie Otwórz Booking.com otwiera przeglądarkę z adresem docelowym', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValueOnce(true);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined as any);

    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(t.button_openBooking));

    await waitFor(() => {
      expect(Linking.canOpenURL).toHaveBeenCalledWith(
        expect.stringContaining('https://www.booking.com/searchresults.html?ss=Rzym')
      );
      expect(openUrlSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://www.booking.com/searchresults.html?ss=Rzym')
      );
    });
  });

  test('gdy system nie może otworzyć Booking.com wyświetla Alert błędu', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValueOnce(false);
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(t.button_openBooking));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('DESTIVO', commonT.label_error);
    });
  });

  test('gdy Linking.canOpenURL rzuci wyjątek, błąd jest przechwytywany i logowany', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValueOnce(new Error('Linking error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(t.button_openBooking));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });

  test('wprowadzenie adresu i kliknięcie Dalej zapisuje adres w store i przechodzi do Step4', () => {
    render(<Step3LodgingScreen />);

    const input = screen.getByPlaceholderText(t.input_accommodationAddressPlaceholder);
    fireEvent.changeText(input, 'Via del Corso 12, Rzym');

    fireEvent.press(screen.getByText(commonT.button_nextStep));

    expect(useTripCreatorStore.getState().lodgingAddress).toBe('Via del Corso 12, Rzym');
    expect(mockNavigate).toHaveBeenCalledWith('Step4Attractions');
  });

  test('wprowadzenie fikcyjnego tekstu (np. brak, ok, -) czyści adres do pustego ciągu', () => {
    render(<Step3LodgingScreen />);

    const input = screen.getByPlaceholderText(t.input_accommodationAddressPlaceholder);
    fireEvent.changeText(input, 'brak');

    fireEvent.press(screen.getByText(commonT.button_nextStep));

    expect(useTripCreatorStore.getState().lodgingAddress).toBe('');
    expect(mockNavigate).toHaveBeenCalledWith('Step4Attractions');
  });

  test('kliknięcie Pomiń czyści adres noclegu i przechodzi do Step4', () => {
    useTripCreatorStore.setState({ lodgingAddress: 'Stary adres' });

    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(commonT.button_skip));

    expect(useTripCreatorStore.getState().lodgingAddress).toBe('');
    expect(mockNavigate).toHaveBeenCalledWith('Step4Attractions');
  });

  test('kliknięcie Wstecz wywołuje navigation.goBack()', () => {
    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(commonT.button_goBack));

    expect(mockGoBack).toHaveBeenCalled();
  });

  test('kliknięcie górnej strzałki powrotu (step3-top-back-btn) wywołuje navigation.goBack()', () => {
    render(<Step3LodgingScreen />);

    const topBackBtn = screen.getByTestId('step3-top-back-btn');
    expect(topBackBtn).toBeTruthy();
    fireEvent.press(topBackBtn);

    expect(mockGoBack).toHaveBeenCalled();
  });

  test('dla języka angielskiego otwiera Booking.com z parametrem lang=en-us', async () => {
    useAuthStore.setState({ language: 'en' });
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValueOnce(true);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined as any);

    render(<Step3LodgingScreen />);

    fireEvent.press(screen.getByText(translations.en.tripCreatorStep3.button_openBooking));

    await waitFor(() => {
      expect(openUrlSpy).toHaveBeenCalledWith(
        expect.stringContaining('lang=en-us')
      );
    });
  });

  test('reaguje na zdarzenia klawiatury (keyboardDidShow / keyboardDidHide)', () => {
    render(<Step3LodgingScreen />);

    // Symulacja pojawienia się i zniknięcia klawiatury
    (Keyboard as any).emit?.('keyboardDidShow', { endCoordinates: { height: 320 } });
    (Keyboard as any).emit?.('keyboardDidHide');
  });
});
