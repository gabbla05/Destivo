/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Share, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SmartPackingModal } from '../src/components/SmartPackingModal';

jest.spyOn(Share, 'share').mockImplementation(jest.fn().mockResolvedValue({ action: 'sharedAction' }));
jest.spyOn(Alert, 'alert');

describe('SmartPackingModal Component', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    tripId: 'trip-pack-modal-1',
    destination: 'Paryż',
    startDate: '10-09-2026',
    endDate: '14-09-2026', // 5 dni
    transportType: 'flight',
  };

  test('Powinien wyrenderować nagłówek, warunki podróży i listę wygenerowanych pozycji', async () => {
    render(<SmartPackingModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Dynamiczny Asystent Pakowania')).toBeTruthy();
      expect(screen.getByText('PARYŻ • Spersonalizowana lista na podstawie warunków Twojej podróży')).toBeTruthy();
      expect(screen.getByText('5 dni')).toBeTruthy();
      expect(screen.getByText('Samolot')).toBeTruthy();
    });

    // Sprawdzamy czy są elementy specyficzne dla samolotu i liczby dni
    await waitFor(() => {
      expect(screen.getByText('Płyny w buteleczkach do 100 ml')).toBeTruthy();
      expect(screen.getByText('Bielizna codzienna')).toBeTruthy();
      expect(screen.getAllByText('6 szt.').length).toBeGreaterThanOrEqual(1); // 5 dni + 1 zapas
    });
  });

  test('Kliknięcie checkboxa przedmiotu oznacza go jako spakowany i aktualizuje postęp', async () => {
    render(<SmartPackingModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('packing-item-check-flight-liquids')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('packing-item-check-flight-liquids'));
    });

    await waitFor(() => {
      // Licznik powinien wzrosnąć
      expect(screen.getByText(/Spakowano 1 z/)).toBeTruthy();
    });
  });

  test('Użytkownik może dodać własną pozycję do listy pakowania', async () => {
    render(<SmartPackingModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('custom-item-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('custom-item-input'), 'Dron z kamerą');
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('custom-item-add-btn'));
    });

    await waitFor(() => {
      expect(screen.getByText('Dron z kamerą')).toBeTruthy();
    });
  });

  test('Udostępnianie listy wywołuje natywny Share.share z przygotowanym tekstem', async () => {
    render(<SmartPackingModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('share-packing-btn')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('share-packing-btn'));
    });

    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dynamiczny Asystent Pakowania',
        message: expect.stringContaining('DESTIVO - LISTA PAKOWANIA: PARYŻ'),
      })
    );
  });

  test('Zamknięcie modala wywołuje callback onClose', async () => {
    render(<SmartPackingModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('close-packing-modal-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('close-packing-modal-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
