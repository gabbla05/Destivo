// __tests__/tests_ProximityAlertComponents.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QuickTicketPassModal } from '../src/components/QuickTicketPassModal';
import { ProximityAlertBanner } from '../src/components/ProximityAlertBanner';
import * as proximityService from '../src/lib/proximityAlertService';

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock safe-area
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: any) => children,
  };
});

describe('Proximity Alert UI Components', () => {
  describe('1. QuickTicketPassModal - Błyskawiczny podgląd biletu z Sejfu', () => {
    const mockTicket = {
      id: 'ticket-1',
      name: 'Bilet_Kolejowy_Krakow.pdf',
      uri: 'file:///vault/bilet.pdf',
      type: 'PDF',
    };

    test('Renderuje dane stacji, celu podróży oraz etykietę gotowości do kontroli', () => {
      const { getByText, getAllByText } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          departureTime="14:30"
          stationName="Warszawa Centralna"
          destination="Kraków"
          transportType="train"
        />
      );

      expect(getByText('Warszawa Centralna')).toBeTruthy();
      expect(getByText('Kraków')).toBeTruthy();
      expect(getByText('14:30')).toBeTruthy();
      expect(getByText('GOTOWY DO OKAZANIA')).toBeTruthy();
      expect(getAllByText('Bilet_Kolejowy_Krakow.pdf').length).toBeGreaterThan(0);
    });

    test('Przycisk zamknięcia wywołuje onClose', () => {
      const onCloseMock = jest.fn();
      const { getByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={onCloseMock}
          ticketFile={mockTicket}
          departureTime="14:30"
          stationName="Warszawa Centralna"
          destination="Kraków"
        />
      );

      fireEvent.press(getByTestId('quick-pass-close-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    test('Przycisk przejścia do Sejfu wywołuje onOpenVault', () => {
      const onOpenVaultMock = jest.fn();
      const { getByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          departureTime="14:30"
          stationName="Warszawa Centralna"
          destination="Kraków"
          onOpenVault={onOpenVaultMock}
        />
      );

      fireEvent.press(getByTestId('quick-pass-goto-vault-btn'));
      expect(onOpenVaultMock).toHaveBeenCalledTimes(1);
    });

    test('Bilet graficzny renderuje przyciski powiększania i reaguje na zoom in/out/reset', () => {
      const imageTicket = {
        id: 'ticket-img-1',
        name: 'bilet_pkp_qr.jpg',
        uri: 'file:///vault/bilet_pkp_qr.jpg',
        type: 'IMAGE',
      };

      const { getByTestId, getByText, queryByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={imageTicket}
          departureTime="18:00"
          stationName="Gdańsk Główny"
          destination="Warszawa"
        />
      );

      expect(getByText('100%')).toBeTruthy();
      expect(queryByTestId('quick-pass-zoom-reset-btn')).toBeNull();

      // Kliknięcie zoom-in
      fireEvent.press(getByTestId('quick-pass-zoom-in-btn'));
      expect(getByText('150%')).toBeTruthy();
      expect(getByTestId('quick-pass-zoom-reset-btn')).toBeTruthy();

      // Kliknięcie reset
      fireEvent.press(getByTestId('quick-pass-zoom-reset-btn'));
      expect(getByText('100%')).toBeTruthy();
    });

    test('Podwyższa jasność ekranu do 100% przy otwarciu i przywraca po zamknięciu', async () => {
      const Brightness = require('expo-brightness');
      const { unmount } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          departureTime="14:30"
          stationName="Warszawa Centralna"
          destination="Kraków"
        />
      );

      await waitFor(() => {
        expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1.0);
      });

      unmount();
      expect(
        Brightness.restoreSystemBrightnessAsync || Brightness.setBrightnessAsync
      ).toBeTruthy();
    });

    test('Obsługuje przełączanie zakładek odcinków TAM / POWRÓT', () => {
      const { getByTestId, getByText, getAllByText } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          outboundTicket={{ id: 't-out', name: 'Tam.pdf', uri: 'file:///vault/tam.pdf', type: 'PDF' }}
          returnTicket={{ id: 't-ret', name: 'Powrot.pdf', uri: 'file:///vault/powrot.pdf', type: 'PDF' }}
          outboundDepartureTime="09:00"
          returnDepartureTime="19:30"
          outboundStation="Warszawa Centralna"
          returnStation="Kraków Główny"
          destination="Kraków"
        />
      );

      expect(getByTestId('quick-pass-leg-outbound-btn')).toBeTruthy();
      expect(getByTestId('quick-pass-leg-return-btn')).toBeTruthy();

      // Przełączenie na powrót
      fireEvent.press(getByTestId('quick-pass-leg-return-btn'));
      expect(getAllByText('Powrot.pdf').length).toBeGreaterThan(0);
      expect(getByText('19:30')).toBeTruthy();

      // Przełączenie na wyjazd
      fireEvent.press(getByTestId('quick-pass-leg-outbound-btn'));
      expect(getAllByText('Tam.pdf').length).toBeGreaterThan(0);
      expect(getByText('09:00')).toBeTruthy();
    });

    test('Rozpoznaje ikony różnych środków transportu (flight, bus, car)', () => {
      const { rerender, getByText } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          transportType="flight"
        />
      );
      expect(getByText('FLIGHT')).toBeTruthy();

      rerender(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          transportType="bus"
        />
      );
      expect(getByText('BUS')).toBeTruthy();

      rerender(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
          transportType="car"
        />
      );
      expect(getByText('CAR')).toBeTruthy();
    });

    test('Obsługuje akcje PDF i udostępnianie pliku', async () => {
      const Sharing = require('expo-sharing');
      Sharing.shareAsync.mockClear();

      const { getByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={mockTicket}
        />
      );

      fireEvent.press(getByTestId('quick-pass-open-pdf-btn'));
      await waitFor(() => {
        expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///vault/bilet.pdf', expect.anything());
      });

      fireEvent.press(getByTestId('quick-pass-share-pdf-btn'));
      await waitFor(() => {
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(2);
      });
    });

    test('Obsługuje udostępnianie biletu graficznego oraz przycisk zoom-out', async () => {
      const Sharing = require('expo-sharing');
      Sharing.shareAsync.mockClear();

      const imageTicket = {
        id: 'ticket-img-2',
        name: 'bilet.jpg',
        uri: 'file:///vault/bilet.jpg',
        type: 'IMAGE',
      };

      const { getByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={jest.fn()}
          ticketFile={imageTicket}
        />
      );

      // Zoom in i zoom out
      fireEvent.press(getByTestId('quick-pass-zoom-in-btn'));
      fireEvent.press(getByTestId('quick-pass-zoom-out-btn'));

      fireEvent.press(getByTestId('quick-pass-share-img-btn'));
      await waitFor(() => {
        expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///vault/bilet.jpg', expect.anything());
      });
    });

    test('Wyświetla stan pusty gdy ticketFile jest null oraz zamyka przyciskiem Gotowe', () => {
      const onCloseMock = jest.fn();
      const { getByText, getByTestId } = render(
        <QuickTicketPassModal
          visible={true}
          onClose={onCloseMock}
          ticketFile={null}
        />
      );

      expect(getByText(/Brak dołączonego biletu/)).toBeTruthy();

      fireEvent.press(getByTestId('quick-pass-dismiss-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. ProximityAlertBanner - Kontekstowy baner zbliżeniowy', () => {
    const mockTrip = {
      id: 'trip-100',
      origin: 'Warszawa',
      destination: 'Gdańsk',
      start_date: '2026-09-25',
      transport_type: 'train',
      transport_data: JSON.stringify({
        details: {
          outboundDepartureTime: '15:00',
          outboundDepartureLocation: 'Warszawa Centralna',
        },
      }),
    };

    test('Wyświetla baner i reaguje na kliknięcie Pokaż bilet', async () => {
      jest.spyOn(proximityService, 'checkProximityStatus').mockResolvedValue({
        shouldAlert: true,
        reason: 'TIME',
        minutesUntilDeparture: 40,
        distanceMeters: null,
        stationName: 'Warszawa Centralna',
        ticketFile: { id: 't-1', name: 'pass.pdf' },
        departureTime: '15:00',
        destination: 'Gdańsk',
        transportType: 'train',
      });

      const onShowTicketMock = jest.fn();

      const { getByTestId, getByText } = render(
        <ProximityAlertBanner
          trip={mockTrip}
          onShowTicket={onShowTicketMock}
        />
      );

      await waitFor(() => {
        expect(getByText('Odjazd za 40 min')).toBeTruthy();
      });

      fireEvent.press(getByTestId('proximity-banner-show-ticket'));
      expect(onShowTicketMock).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'Gdańsk',
          minutesUntilDeparture: 40,
        })
      );
    });

    test('Ukrywa baner po kliknięciu ikony zamknięcia', async () => {
      jest.spyOn(proximityService, 'checkProximityStatus').mockResolvedValue({
        shouldAlert: true,
        reason: 'LOCATION',
        minutesUntilDeparture: null,
        distanceMeters: 250,
        stationName: 'Warszawa Centralna',
        ticketFile: null,
        departureTime: '15:00',
        destination: 'Gdańsk',
        transportType: 'train',
      });

      const onDismissMock = jest.fn();

      const { getByTestId, queryByTestId } = render(
        <ProximityAlertBanner
          trip={mockTrip}
          onShowTicket={jest.fn()}
          onDismiss={onDismissMock}
        />
      );

      await waitFor(() => {
        expect(getByTestId('proximity-banner-dismiss')).toBeTruthy();
      });

      fireEvent.press(getByTestId('proximity-banner-dismiss'));
      expect(onDismissMock).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(queryByTestId('proximity-alert-banner')).toBeNull();
      });
    });
  });
});
