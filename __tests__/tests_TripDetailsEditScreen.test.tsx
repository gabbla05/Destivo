/// <reference types="jest" />
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const trip = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  trip_name: 'Weekend w Krakowie',
  origin: 'Warszawa',
  destination: 'Kraków',
  transport_data: JSON.stringify({ selectedOption: { type: 'train' } }),
  lodging_data: JSON.stringify({ lodgingAddress: '' }),
  attractions_data: JSON.stringify({
    customTimeline: [
      { id: 'evt_dep', type: 'DEPARTURE', title: 'Wyjazd', subtitle: 'Podróż (TRAIN)', timeStr: '08:00', parsedDate: '2030-05-10T08:00:00.000Z' },
      { id: 'evt_return', type: 'RETURN', title: 'Powrót', subtitle: 'Podróż powrotna', timeStr: '18:00', parsedDate: '2030-05-12T18:00:00.000Z' },
    ],
  }),
};

const mockExecute = jest.fn(async (sql: string) =>
  sql.startsWith('SELECT') ? { rows: { _array: [trip] } } : { rows: { _array: [] } }
);
jest.mock('@powersync/react-native', () => ({ usePowerSync: () => ({ execute: mockExecute }) }));
jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' }, isGuest: false, language: 'pl' }),
}));
const mockPush = jest.fn().mockResolvedValue(true);
jest.mock('../src/lib/tripSync', () => ({ pushTripToCloud: (...a: any[]) => mockPush(...a) }));
const mockPickFile = jest.fn().mockResolvedValue({ id: 'f1', name: 'bilet-ic.pdf', uri: 'file:///vault/f1.vault', type: 'PDF' });
jest.mock('../src/lib/vaultManager', () => ({ VaultManager: { pickFile: (...a: any[]) => mockPickFile(...a), pickImage: jest.fn() } }));
jest.mock('../src/lib/transportHubs', () => ({
  hubKindsForTransport: () => ['train_station'],
  findNearbyHubs: jest.fn(async () => [
    { id: 'h1', name: 'Warszawa Centralna', address: 'Al. Jerozolimskie 54', lat: 52.2, lon: 21, distanceKm: 1.2, kind: 'train_station' },
  ]),
}));

import { TripDetailsEditScreen } from '../src/screens/TripDetailsEditScreen';

describe('TripDetailsEditScreen — transport, bilety i nocleg istniejącej podróży', () => {
  const navigation = { goBack: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  test('wybór stacji z listy, godziny, bilet i adres trafiają do bazy, chmury i na oś czasu', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<TripDetailsEditScreen route={{ params: { tripId: trip.id } }} navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId('edit-outboundDepartureLocation')).toBeTruthy());

    // stacja z listy w pobliżu
    fireEvent.press(screen.getByTestId('edit-outboundDepartureLocation-pick'));
    await waitFor(() => expect(screen.getByText('Warszawa Centralna')).toBeTruthy());
    fireEvent.press(screen.getByText('Warszawa Centralna'));
    expect(screen.getByTestId('edit-outboundDepartureLocation').props.value).toBe('Warszawa Centralna');

    fireEvent.changeText(screen.getByTestId('edit-outboundArrivalLocation'), 'Kraków Główny');
    fireEvent.changeText(screen.getByTestId('edit-outboundDepartureTime'), '7.15');
    fireEvent.changeText(screen.getByTestId('edit-lodging-address'), 'ul. Floriańska 12');

    // bilet tam: wybór PDF w oknie
    fireEvent.press(screen.getByTestId('edit-add-ticket-outbound'));
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as any[];
    await buttons.find((b) => b.text === 'PDF').onPress();
    await waitFor(() => expect(screen.getByText('bilet-ic.pdf')).toBeTruthy());

    fireEvent.press(screen.getByTestId('edit-trip-save'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.anything(), trip.id, expect.any(String)));
    const update = (mockExecute.mock.calls as any[][]).find((c) => String(c[0]).startsWith('UPDATE trips SET transport_data'))!;
    const [transportJson, lodgingJson, attractionsJson] = update[1] as string[];
    const transport = JSON.parse(transportJson);
    expect(transport.details.outboundDepartureLocation).toBe('Warszawa Centralna');
    expect(transport.details.outboundDepartureTime).toBe('07:15');
    expect(transport.details.outboundTicketFile.name).toBe('bilet-ic.pdf');
    expect(transport.details.ticketFile.name).toBe('bilet-ic.pdf');
    expect(JSON.parse(lodgingJson).lodgingAddress).toBe('ul. Floriańska 12');

    const dep = JSON.parse(attractionsJson).customTimeline.find((e: any) => e.type === 'DEPARTURE');
    expect(dep.timeStr).toBe('07:15');
    expect(dep.subtitle).toBe('Warszawa Centralna ➔ Kraków Główny');
  });
});
