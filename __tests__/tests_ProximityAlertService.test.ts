// __tests__/tests_ProximityAlertService.test.ts
import {
  calculateDistanceMeters,
  getGeofenceRadiusForTransport,
  parseDepartureDateTime,
  resolveHubCoordinates,
  findActiveTicketForTrip,
  checkProximityStatus,
  scheduleLocalDepartureNotification,
  cancelScheduledDepartureNotification,
  setupGeofencingForTrip,
} from '../src/lib/proximityAlertService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id-123'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

// Mock expo-location
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  startGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  stopGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  hasStartedGeofencingAsync: jest.fn().mockResolvedValue(false),
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn().mockReturnValue(true),
}));

describe('ProximityAlertService - Energooszczędne zarządzanie geolokalizacją i alerty zbliżeniowe', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('1. Formuła Haversine i promienie stref geofence', () => {
    test('calculateDistanceMeters poprawnie wylicza dystans między punktami geograficznymi', () => {
      // Dworzec Centralny (52.2288, 21.0032) -> Lotnisko Chopina (52.1672, 20.9679)
      const distance = calculateDistanceMeters(52.2288, 21.0032, 52.1672, 20.9679);
      // Odległość w linii prostej to ok. 7.2 km (7000 - 7500 m)
      expect(distance).toBeGreaterThan(6500);
      expect(distance).toBeLessThan(8000);
    });

    test('calculateDistanceMeters zwraca 0 dla identycznych punktów', () => {
      const distance = calculateDistanceMeters(52.2288, 21.0032, 52.2288, 21.0032);
      expect(distance).toBe(0);
    });

    test('getGeofenceRadiusForTransport zwraca zróżnicowane promienie zależnie od rodzaju węzła', () => {
      expect(getGeofenceRadiusForTransport('flight')).toBe(1500); // 1.5 km dla rozległych lotnisk
      expect(getGeofenceRadiusForTransport('train')).toBe(600);   // 600 m dla dworców kolejowych
      expect(getGeofenceRadiusForTransport('bus')).toBe(500);     // 500 m dla dworców autobusowych
      expect(getGeofenceRadiusForTransport('other')).toBe(600);
    });
  });

  describe('2. Parsowanie dat i godzin odjazdu', () => {
    test('parseDepartureDateTime poprawnie parsuje format YYYY-MM-DD i HH:mm', () => {
      const parsed = parseDepartureDateTime('2026-09-25', '14:30');
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8); // Wrzesień = 8 (0-indexed)
      expect(parsed?.getDate()).toBe(25);
      expect(parsed?.getHours()).toBe(14);
      expect(parsed?.getMinutes()).toBe(30);
    });

    test('parseDepartureDateTime poprawnie parsuje format DD-MM-YYYY', () => {
      const parsed = parseDepartureDateTime('25-09-2026', '08:15');
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getDate()).toBe(25);
      expect(parsed?.getHours()).toBe(8);
      expect(parsed?.getMinutes()).toBe(15);
    });

    test('parseDepartureDateTime zwraca null dla pustej lub niepoprawnej daty', () => {
      expect(parseDepartureDateTime('', '12:00')).toBeNull();
      expect(parseDepartureDateTime(undefined, '12:00')).toBeNull();
    });
  });

  describe('3. Wyszukiwanie współrzędnych węzłów komunikacyjnych (Offline-First)', () => {
    test('resolveHubCoordinates natychmiast dopasowuje znane węzły ze słownika offline', async () => {
      const centralna = await resolveHubCoordinates('Warszawa Centralna');
      expect(centralna).not.toBeNull();
      expect(centralna?.lat).toBeCloseTo(52.2288, 3);
      expect(centralna?.lon).toBeCloseTo(21.0032, 3);

      const chopin = await resolveHubCoordinates('Lotnisko Chopina');
      expect(chopin).not.toBeNull();
      expect(chopin?.lat).toBeCloseTo(52.1672, 3);
    });

    test('resolveHubCoordinates zwraca null dla pustego zapytania', async () => {
      const res = await resolveHubCoordinates('', '');
      expect(res).toBeNull();
    });
  });

  describe('4. Ekstrakcja biletu do podróżnego Travel Day Pass', () => {
    test('findActiveTicketForTrip pobiera bilet z sekcji transport_data', () => {
      const trip = {
        origin: 'Warszawa',
        destination: 'Kraków',
        transport_data: JSON.stringify({
          details: {
            outboundDepartureTime: '15:45',
            outboundDepartureLocation: 'Warszawa Centralna',
            ticketFile: {
              id: 'file-1',
              name: 'Bilet_PKP.pdf',
              uri: 'file:///vault/bilet.pdf',
              type: 'PDF',
            },
          },
        }),
      };

      const result = findActiveTicketForTrip(trip);
      expect(result).not.toBeNull();
      expect(result?.source).toBe('transport');
      expect(result?.file?.name).toBe('Bilet_PKP.pdf');
      expect(result?.departureTime).toBe('15:45');
      expect(result?.stationName).toBe('Warszawa Centralna');
    });

    test('findActiveTicketForTrip znajduje bilet w lodging_data.vaultFiles', () => {
      const trip = {
        origin: 'Gdańsk',
        destination: 'Rzym',
        transport_data: JSON.stringify({ details: { outboundDepartureTime: '10:00' } }),
        lodging_data: JSON.stringify({
          vaultFiles: [
            { id: 'f-1', name: 'hotel_voucher.pdf', uri: 'file:///hotel.pdf' },
            { id: 'f-2', name: 'Boarding_Pass_Lotnisko.jpg', uri: 'file:///pass.jpg', type: 'IMAGE' },
          ],
        }),
      };

      const result = findActiveTicketForTrip(trip);
      expect(result).not.toBeNull();
      expect(result?.source).toBe('vault');
      expect(result?.file?.name).toBe('Boarding_Pass_Lotnisko.jpg');
    });
  });

  describe('5. Sprawdzanie statusu zbliżeniowego (Proximity Check)', () => {
    test('checkProximityStatus aktywuje alert czasowy gdy odjazd jest za 45 minut', async () => {
      const simulatedNow = new Date(2026, 8, 25, 13, 45, 0); // 13:45
      const trip = {
        id: 'trip-1',
        origin: 'Warszawa',
        destination: 'Kraków',
        start_date: '2026-09-25',
        transport_type: 'train',
        transport_data: JSON.stringify({
          details: {
            outboundDepartureTime: '14:30', // Odjazd za 45 minut
            outboundDepartureLocation: 'Warszawa Centralna',
          },
        }),
      };

      const status = await checkProximityStatus(trip, null, simulatedNow);
      expect(status.shouldAlert).toBe(true);
      expect(status.reason).toBe('TIME');
      expect(status.minutesUntilDeparture).toBe(45);
    });

    test('checkProximityStatus NIE aktywuje alertu gdy wyjazd jest za kilka dni', async () => {
      const simulatedNow = new Date(2026, 8, 20, 12, 0, 0); // 5 dni wcześniej
      const trip = {
        id: 'trip-1',
        start_date: '2026-09-25',
        transport_data: JSON.stringify({
          details: { outboundDepartureTime: '14:30' },
        }),
      };

      const status = await checkProximityStatus(trip, null, simulatedNow);
      expect(status.shouldAlert).toBe(false);
      expect(status.reason).toBe('NONE');
    });

    test('checkProximityStatus aktywuje alert lokalizacyjny gdy użytkownik jest w promieniu dworca', async () => {
      const simulatedNow = new Date(2026, 8, 25, 10, 0, 0); // 4.5h przed odjazdem (czas nie wyzwala)
      const userCoords = { latitude: 52.2290, longitude: 21.0035 }; // 30 metrów od Warszawy Centralnej
      const trip = {
        id: 'trip-1',
        origin: 'Warszawa',
        destination: 'Kraków',
        start_date: '2026-09-25',
        transport_type: 'train',
        transport_data: JSON.stringify({
          details: {
            outboundDepartureTime: '14:30',
            outboundDepartureLocation: 'Warszawa Centralna',
          },
        }),
      };

      const status = await checkProximityStatus(trip, userCoords, simulatedNow);
      expect(status.shouldAlert).toBe(true);
      expect(status.reason).toBe('LOCATION');
      expect(status.distanceMeters).toBeLessThan(100);
    });
  });

  describe('6. Planowanie i anulowanie powiadomień lokalnych', () => {
    test('scheduleLocalDepartureNotification planuje powiadomienie offline na T-60 min przed odjazdem', async () => {
      // Przyszła data
      const futureDate = new Date(Date.now() + 120 * 60 * 1000); // za 2 godziny
      const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(futureDate.getHours()).padStart(2, '0')}:${String(futureDate.getMinutes()).padStart(2, '0')}`;

      const trip = {
        id: 'trip-123',
        destination: 'Wiedeń',
        start_date: dateStr,
        transport_data: JSON.stringify({
          details: { outboundDepartureTime: timeStr },
        }),
      };

      const notifId = await scheduleLocalDepartureNotification(trip, 'pl');
      expect(notifId).toBe('test-notification-id-123');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      // Sprawdzenie zapisu w pamięci
      const savedId = await AsyncStorage.getItem(`@destivo_proximity_notif_${trip.id}`);
      expect(savedId).toBe('test-notification-id-123');
    });

    test('scheduleLocalDepartureNotification wysyła natychmiastowe powiadomienie (TIME_INTERVAL 2s) gdy odjazd jest za <= 60 minut', async () => {
      // Odjazd za 25 minut
      const nearFutureDate = new Date(Date.now() + 25 * 60 * 1000);
      const dateStr = `${nearFutureDate.getFullYear()}-${String(nearFutureDate.getMonth() + 1).padStart(2, '0')}-${String(nearFutureDate.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(nearFutureDate.getHours()).padStart(2, '0')}:${String(nearFutureDate.getMinutes()).padStart(2, '0')}`;

      const trip = {
        id: 'trip-near-123',
        destination: 'Paryż',
        start_date: dateStr,
        transport_data: JSON.stringify({
          details: { outboundDepartureTime: timeStr },
        }),
      };

      const notifId = await scheduleLocalDepartureNotification(trip, 'pl');
      expect(notifId).toBe('test-notification-id-123');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            channelId: 'destivo-proximity-alerts',
          }),
          trigger: {
            type: 'timeInterval',
            seconds: 2,
          },
        })
      );

      // Ponowne wywołanie nie dubluje powiadomienia (deduplikacja deliveredKey)
      const secondCallId = await scheduleLocalDepartureNotification(trip, 'pl');
      expect(secondCallId).toBeNull();
    });

    test('scheduleLocalDepartureNotification ustawia autoDismiss: false oraz sticky: true', async () => {
      const nearFutureDate = new Date(Date.now() + 15 * 60 * 1000);
      const dateStr = `${nearFutureDate.getFullYear()}-${String(nearFutureDate.getMonth() + 1).padStart(2, '0')}-${String(nearFutureDate.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(nearFutureDate.getHours()).padStart(2, '0')}:${String(nearFutureDate.getMinutes()).padStart(2, '0')}`;

      const trip = {
        id: 'trip-sticky-test',
        destination: 'Rzym',
        start_date: dateStr,
        transport_data: JSON.stringify({
          details: { outboundDepartureTime: timeStr },
        }),
      };

      await scheduleLocalDepartureNotification(trip, 'pl');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            autoDismiss: false,
            sticky: true,
            data: expect.objectContaining({
              tripId: 'trip-sticky-test',
              expiresAt: expect.any(Number),
            }),
          }),
        })
      );
    });

    test('cancelScheduledDepartureNotification usuwa zaplanowane powiadomienie', async () => {
      await AsyncStorage.setItem('@destivo_proximity_notif_trip-999', 'notif-to-cancel');

      await cancelScheduledDepartureNotification('trip-999');
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-to-cancel');

      const savedId = await AsyncStorage.getItem('@destivo_proximity_notif_trip-999');
      expect(savedId).toBeNull();
    });
  });

  describe('7. Ochrona baterii w Geofencingu', () => {
    test('setupGeofencingForTrip NIE rejestruje geofence gdy wyjazd jest za więcej niż 24 godziny', async () => {
      const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000); // za 48h
      const dateStr = `${farFuture.getFullYear()}-${String(farFuture.getMonth() + 1).padStart(2, '0')}-${String(farFuture.getDate()).padStart(2, '0')}`;

      const trip = {
        id: 'trip-far',
        origin: 'Warszawa',
        start_date: dateStr,
        transport_data: JSON.stringify({
          details: {
            outboundDepartureTime: '12:00',
            outboundDepartureLocation: 'Warszawa Centralna',
          },
        }),
      };

      const result = await setupGeofencingForTrip(trip);
      expect(result).toBe(false);
      expect(Location.startGeofencingAsync).not.toHaveBeenCalled();
    });

    test('setupGeofencingForTrip rejestruje geofence gdy wyjazd jest w ciągu 24 godzin', async () => {
      const nearFuture = new Date(Date.now() + 3 * 60 * 60 * 1000); // za 3h
      const dateStr = `${nearFuture.getFullYear()}-${String(nearFuture.getMonth() + 1).padStart(2, '0')}-${String(nearFuture.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(nearFuture.getHours()).padStart(2, '0')}:${String(nearFuture.getMinutes()).padStart(2, '0')}`;

      const trip = {
        id: 'trip-near',
        origin: 'Warszawa',
        start_date: dateStr,
        transport_type: 'train',
        transport_data: JSON.stringify({
          details: {
            outboundDepartureTime: timeStr,
            outboundDepartureLocation: 'Warszawa Centralna',
          },
        }),
      };

      const result = await setupGeofencingForTrip(trip);
      expect(result).toBe(true);
      expect(Location.startGeofencingAsync).toHaveBeenCalledTimes(1);
    });
  });
});
