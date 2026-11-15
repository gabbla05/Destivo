/// <reference types="jest" />
// P13: geofencing w tle - wybór odjazdu, rejestracja i sprzątanie stref, obsługa wejścia w strefę.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  getUpcomingDeparture,
  setupGeofencingForTrip,
  cleanupExpiredGeofences,
  clearGeofencingForTrip,
  handleGeofenceEnter,
  requestBackgroundLocationConsent,
  setDepartureGeofenceEnabled,
  GEOFENCING_TASK_NAME,
  GEOFENCE_STORAGE_KEY_PREFIX,
} from '../src/lib/proximityAlertService';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  startGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  stopGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  hasStartedGeofencingAsync: jest.fn().mockResolvedValue(true),
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4, MAX: 5 },
}));

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

const tripStartingIn = (hours: number) => {
  const start = new Date(Date.now() + hours * 3600000);
  const end = new Date(start.getTime() + 3 * 86400000);
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  return {
    id: 'trip-geo',
    origin: 'Warszawa',
    destination: 'Kraków',
    start_date: fmt(start),
    end_date: fmt(end),
    transport_type: 'train',
    transport_data: JSON.stringify({
      details: {
        outboundDepartureTime: `${hh}:${mm}`,
        outboundDepartureLocation: 'Warszawa Centralna',
        outboundTicketFile: { id: 't1', name: 'Bilet.pdf', uri: 'file:///vault/t1.vault', type: 'PDF', encryptionVersion: 1 },
      },
    }),
    lodging_data: '{}',
    attractions_data: '{}',
  };
};

describe('Geofencing w tle (P13)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  });

  test('wybiera odjazd tylko w oknie 48 h', () => {
    expect(getUpcomingDeparture(tripStartingIn(5))?.leg).toBe('outbound');
    expect(getUpcomingDeparture(tripStartingIn(24 * 5))).toBeNull();
  });

  test('rejestruje strefę wokół miejsca odjazdu i zapisuje ją z czasem wygaśnięcia', async () => {
    const ok = await setupGeofencingForTrip(tripStartingIn(5));
    expect(ok).toBe(true);
    const [task, regions] = (Location.startGeofencingAsync as jest.Mock).mock.calls[0];
    expect(task).toBe(GEOFENCING_TASK_NAME);
    expect(regions[0]).toEqual(
      expect.objectContaining({ identifier: 'trip_trip-geo_outbound', radius: 600, notifyOnEnter: true })
    );
    const stored = JSON.parse((await AsyncStorage.getItem(`${GEOFENCE_STORAGE_KEY_PREFIX}trip_trip-geo_outbound`))!);
    expect(stored.tripId).toBe('trip-geo');
    expect(stored.ticketFile.uri).toBe('file:///vault/t1.vault');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  test('lot zapisany jak w bazie (bez kolumny transport_type) dostaje promień lotniska 1,5 km', async () => {
    const base = tripStartingIn(5);
    const { transport_type, ...dbRow } = base;
    const td = JSON.parse(base.transport_data);
    const flightRow = { ...dbRow, transport_data: JSON.stringify({ ...td, selectedOption: { type: 'flight' } }) };
    expect(await setupGeofencingForTrip(flightRow)).toBe(true);
    const [, regions] = (Location.startGeofencingAsync as jest.Mock).mock.calls[0];
    expect(regions[0].radius).toBe(1500);
  });

  test('bez zgody na lokalizację w tle niczego nie rejestruje', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await setupGeofencingForTrip(tripStartingIn(5))).toBe(false);
    expect(Location.startGeofencingAsync).not.toHaveBeenCalled();
  });

  test('wyłączony przełącznik w profilu blokuje rejestrację i zatrzymuje strefy', async () => {
    await setDepartureGeofenceEnabled(false);
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(await setupGeofencingForTrip(tripStartingIn(5))).toBe(false);
  });

  test('wejście w strefę: jedno powiadomienie z biletem, bez powtórzeń', async () => {
    await setupGeofencingForTrip(tripStartingIn(5));
    expect(await handleGeofenceEnter('trip_trip-geo_outbound')).toBe(true);
    expect(await handleGeofenceEnter('trip_trip-geo_outbound')).toBe(false);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const content = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].content;
    expect(content.data).toEqual(
      expect.objectContaining({ type: 'GEOFENCE_ENTER', tripId: 'trip-geo', activeLeg: 'outbound' })
    );
    expect(content.data.ticketFile.uri).toBe('file:///vault/t1.vault');
    expect(content.body).toContain('Warszawa Centralna');
  });

  test('wygasła strefa jest sprzątana', async () => {
    await AsyncStorage.setItem(
      `${GEOFENCE_STORAGE_KEY_PREFIX}trip_old_outbound`,
      JSON.stringify({ regionId: 'trip_old_outbound', tripId: 'old', expiresAt: Date.now() - 1000 })
    );
    await cleanupExpiredGeofences();
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`${GEOFENCE_STORAGE_KEY_PREFIX}trip_old_outbound`)).toBeNull();
  });

  test('usunięcie podróży usuwa jej strefę', async () => {
    await setupGeofencingForTrip(tripStartingIn(5));
    await clearGeofencingForTrip('trip-geo');
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`${GEOFENCE_STORAGE_KEY_PREFIX}trip_trip-geo_outbound`)).toBeNull();
  });

  test('zgoda w dwóch krokach: najpierw lokalizacja podczas używania, potem wyjaśnienie, potem "zawsze"; pytamy raz', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const confirm = jest.fn().mockResolvedValue(true);

    expect(await requestBackgroundLocationConsent('pl', confirm)).toBe(true);
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Zawsze'));
    expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();

    // Drugi raz już nie pytamy
    confirm.mockClear();
    expect(await requestBackgroundLocationConsent('pl', confirm)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('odmowa w naszym oknie nie wywołuje prośby systemowej', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestBackgroundLocationConsent('pl', jest.fn().mockResolvedValue(false))).toBe(false);
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
