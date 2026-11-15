/// <reference types="jest" />
// P3: wspólne czyszczenie danych użytkownika na telefonie ("Usuń moje dane" i "Usuń konto").
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { wipeLocalUserData } from '../src/lib/localDataWipe';
import { VaultManager } from '../src/lib/vaultManager';
import { useVaultStore } from '../src/store/vaultStore';
import { useTripCreatorStore } from '../src/store/tripCreatorStore';
import * as proximity from '../src/lib/proximityAlertService';

jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('wipeLocalUserData', () => {
  let wipeVaultSpy: jest.SpyInstance;
  let resetPinSpy: jest.SpyInstance;
  let geofenceSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    wipeVaultSpy = jest.spyOn(VaultManager, 'wipeVault').mockResolvedValue(undefined);
    resetPinSpy = jest.spyOn(useVaultStore.getState(), 'resetPin');
    geofenceSpy = jest.spyOn(proximity, 'clearGeofencing').mockResolvedValue(undefined);
  });

  afterEach(() => {
    wipeVaultSpy.mockRestore();
    resetPinSpy.mockRestore();
    geofenceSpy.mockRestore();
  });

  test('usuwa podróże, listy pakowania, powiadomienia, Sejf i PIN; zostawia ustawienia i pamięci podręczne', async () => {
    await AsyncStorage.multiSet([
      ['destivo_cached_trips_user-1', '[]'],
      ['destivo_timeline_trip-1', '[]'],
      ['destivo_packing_list_trip-1', '{}'],
      ['@destivo_proximity_notif_trip-1', 'notif-id'],
      ['@destivo_proximity_geofence_trip-1', '{}'],
      ['destivo-auth-store', '{"state":{"language":"pl"}}'],
      ['@destivo_places_photos_v3', '{}'],
      ['@destivo_live_exchange_rates', '{}'],
    ]);
    useTripCreatorStore.setState({ destination: 'Rzym' } as any);
    const db = { execute: jest.fn().mockResolvedValue(undefined) };

    await wipeLocalUserData(db);

    expect(db.execute).toHaveBeenCalledWith('DELETE FROM trips');
    const remaining = await AsyncStorage.getAllKeys();
    expect([...remaining].sort()).toEqual(
      // destivo-vault-store to zapisany stan sejfu (teraz hasPin: false)
      ['@destivo_live_exchange_rates', '@destivo_places_photos_v3', 'destivo-auth-store', 'destivo-vault-store'].sort()
    );
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(geofenceSpy).toHaveBeenCalled();
    expect(wipeVaultSpy).toHaveBeenCalled();
    expect(useVaultStore.getState().hasPin).toBe(false);
    expect((useTripCreatorStore.getState() as any).destination).not.toBe('Rzym');
  });

  test('błąd jednego kroku nie przerywa pozostałych, a na końcu zgłaszany jest błąd', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem('destivo_packing_list_trip-1', '{}');
    const db = { execute: jest.fn().mockRejectedValue(new Error('db locked')) };

    await expect(wipeLocalUserData(db)).rejects.toThrow('trips-db');

    expect(await AsyncStorage.getItem('destivo_packing_list_trip-1')).toBeNull();
    expect(wipeVaultSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
