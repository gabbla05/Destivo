import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { VaultManager } from './vaultManager';
import { clearGeofencing } from './proximityAlertService';
import { useVaultStore } from '../store/vaultStore';
import { useTripCreatorStore } from '../store/tripCreatorStore';

/**
 * Prefiksy kluczy AsyncStorage z danymi użytkownika (podróże, osie czasu, listy pakowania,
 * stan powiadomień i stref geofencingu). Pamięci podręczne niezwiązane z użytkownikiem
 * (zdjęcia miejsc, kursy walut, propozycje Eksploruj) oraz ustawienia (język, sesja) zostają.
 */
export const USER_DATA_KEY_PREFIXES = [
  'destivo_cached_trips_',
  'destivo_timeline_',
  'destivo_packing_list_',
  '@destivo_proximity_notif_',
  '@destivo_proximity_geofence_',
  '@destivo_geofence_notified_',
];

interface LocalDatabase {
  execute: (sql: string, params?: any[]) => Promise<unknown>;
}

/**
 * Usuwa z telefonu wszystkie dane użytkownika: lokalną bazę podróży, kopie podróży i list
 * pakowania w AsyncStorage, zaplanowane powiadomienia, strefy geofencingu, pliki Sejfu,
 * klucz szyfrowania i PIN oraz niedokończony szkic w kreatorze.
 *
 * Każdy krok jest wykonywany niezależnie (błąd jednego nie przerywa pozostałych).
 * Gdy któryś krok się nie powiedzie, funkcja na końcu rzuca błąd z listą nieudanych kroków.
 */
export async function wipeLocalUserData(db?: LocalDatabase | null): Promise<void> {
  const failed: string[] = [];
  const step = async (name: string, action: () => Promise<unknown> | unknown) => {
    try {
      await action();
    } catch (e) {
      console.warn(`[wipeLocalUserData] ${name}:`, e);
      failed.push(name);
    }
  };

  if (db) {
    await step('trips-db', () => db.execute('DELETE FROM trips'));
  }

  await step('async-storage', async () => {
    const keys = await AsyncStorage.getAllKeys();
    const userKeys = keys.filter((key) => USER_DATA_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
    if (userKeys.length > 0) await AsyncStorage.multiRemove(userKeys);
  });

  if (Platform.OS !== 'web') {
    await step('notifications', () => Notifications.cancelAllScheduledNotificationsAsync());
    await step('geofencing', () => clearGeofencing());
  }

  await step('vault-files', () => VaultManager.wipeVault());
  await step('vault-pin', () => useVaultStore.getState().resetPin());
  await step('trip-draft', () => useTripCreatorStore.getState().reset());

  if (failed.length > 0) {
    throw new Error(`Nie udało się wyczyścić: ${failed.join(', ')}`);
  }
}
