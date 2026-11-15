import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Synchronizacja podróży z Supabase.
 *
 * Supabase jest głównym miejscem przechowywania danych zalogowanego użytkownika, a lokalna baza
 * SQLite to kopia na czas braku sieci. Po każdej lokalnej zmianie wysyłamy do chmury CAŁY wiersz
 * podróży (także transport_data i lodging_data). Gdy wysyłka się nie uda (offline), podróż trafia
 * na listę "do wysłania" i jest wysyłana przy następnej okazji (flushPendingTrips).
 * Lista oczekujących chroni też lokalne zmiany przed nadpisaniem starszą wersją z chmury.
 */

export interface LocalDatabase {
  execute: (sql: string, params?: any[]) => Promise<any>;
}

const PENDING_UPSERT_KEY = (userId: string) => `destivo_sync_pending_${userId}`;
const PENDING_DELETE_KEY = (userId: string) => `destivo_sync_pending_delete_${userId}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCloudTripId = (id?: string | null) => Boolean(id && UUID_RE.test(id));

const rowsOf = (result: any): any[] =>
  (result?.array || result?.rows?._array || result?.rows || []) as any[];

const parseJson = (value: any): any => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

/** "15-11-2026", "15.11.2026" albo "2026-11-15" -> "2026-11-15" (format kolumny date w Postgresie). */
export const toCloudDate = (value?: string | null): string | null => {
  if (!value || !String(value).trim()) return null;
  const normalized = String(value).trim().slice(0, 10).replace(/[./]/g, '-');
  const parts = normalized.split('-');
  if (parts.length !== 3) return null;
  if (parts[0].length === 4) return normalized;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};

/** Wiersz tabeli trips w Supabase zbudowany z lokalnego wiersza SQLite. */
export function buildCloudTripRow(local: any, userId: string) {
  const transport = parseJson(local.transport_data);
  const lodging = parseJson(local.lodging_data);
  const asText = (value: any) => (typeof value === 'string' ? value : JSON.stringify(value || {}));
  return {
    id: local.id,
    user_id: userId,
    title: local.trip_name || local.title || 'Podróż',
    origin: local.origin || '',
    destination: local.destination || '',
    start_date: toCloudDate(local.start_date),
    end_date: toCloudDate(local.end_date),
    transport_type: transport?.selectedOption?.type || local.transport_type || null,
    accommodation_address: lodging?.lodgingAddress || local.accommodation_address || '',
    attractions_data: asText(local.attractions_data),
    transport_data: asText(local.transport_data),
    lodging_data: asText(local.lodging_data),
  };
}

const readIds = async (key: string): Promise<string[]> => {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(key)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeIds = async (key: string, ids: string[]) => {
  try {
    if (ids.length === 0) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));
  } catch {}
};

export const getPendingTripIds = (userId: string) => readIds(PENDING_UPSERT_KEY(userId));
export const getPendingDeleteIds = (userId: string) => readIds(PENDING_DELETE_KEY(userId));

const markPending = async (userId: string, tripId: string) =>
  writeIds(PENDING_UPSERT_KEY(userId), [...(await getPendingTripIds(userId)), tripId]);
const clearPending = async (userId: string, tripId: string) =>
  writeIds(PENDING_UPSERT_KEY(userId), (await getPendingTripIds(userId)).filter((id) => id !== tripId));

/** Identyfikator zalogowanego użytkownika z bieżącej sesji (musi zgadzać się z regułą RLS). */
export async function getCloudUserId(fallbackUserId?: string | null): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data?.session?.user?.id;
    if (id) return id;
  } catch {}
  return fallbackUserId && isCloudTripId(fallbackUserId) ? fallbackUserId : null;
}

async function readLocalTrip(db: LocalDatabase, tripId: string): Promise<any | null> {
  try {
    const rows = rowsOf(await db.execute('SELECT * FROM trips WHERE id = ? LIMIT 1', [tripId]));
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Wysyła aktualny stan podróży z lokalnej bazy do Supabase (upsert całego wiersza).
 * Zwraca true, gdy chmura potwierdziła zapis. Gość (brak sesji) -> false, bez kolejkowania.
 */
export async function pushTripToCloud(
  db: LocalDatabase | null | undefined,
  tripId: string,
  fallbackUserId?: string | null
): Promise<boolean> {
  if (!db || !isCloudTripId(tripId)) return false;
  const userId = await getCloudUserId(fallbackUserId);
  if (!userId) return false;

  const local = await readLocalTrip(db, tripId);
  if (!local) return false;

  try {
    const { data, error } = await supabase
      .from('trips')
      .upsert([buildCloudTripRow(local, userId)], { onConflict: 'id' })
      .select('id')
      .maybeSingle();
    if (error || !data) throw error || new Error('Supabase nie potwierdził zapisu podróży.');
    await clearPending(userId, tripId);
    return true;
  } catch (err) {
    console.warn('[tripSync] Podróż czeka na wysłanie do chmury:', tripId, err);
    await markPending(userId, tripId);
    return false;
  }
}

/** Usuwa podróż z chmury; bez sieci zapamiętuje usunięcie do wykonania później. */
export async function deleteTripFromCloud(tripId: string, fallbackUserId?: string | null): Promise<boolean> {
  if (!isCloudTripId(tripId)) return false;
  const userId = await getCloudUserId(fallbackUserId);
  if (!userId) return false;
  await clearPending(userId, tripId);
  try {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (error) throw error;
    await writeIds(PENDING_DELETE_KEY(userId), (await getPendingDeleteIds(userId)).filter((id) => id !== tripId));
    return true;
  } catch (err) {
    console.warn('[tripSync] Usunięcie podróży czeka na sieć:', tripId, err);
    await writeIds(PENDING_DELETE_KEY(userId), [...(await getPendingDeleteIds(userId)), tripId]);
    return false;
  }
}

/** Wysyła wszystkie zaległe zmiany i usunięcia. Zwraca liczbę zmian, które nadal czekają. */
export async function flushPendingTrips(
  db: LocalDatabase | null | undefined,
  fallbackUserId?: string | null
): Promise<number> {
  const userId = await getCloudUserId(fallbackUserId);
  if (!userId) return 0;

  for (const id of await getPendingDeleteIds(userId)) {
    await deleteTripFromCloud(id, userId);
  }
  for (const id of await getPendingTripIds(userId)) {
    const local = db ? await readLocalTrip(db, id) : null;
    if (!local) {
      await clearPending(userId, id); // podróż usunięta lokalnie - nie ma czego wysyłać
      continue;
    }
    await pushTripToCloud(db, id, userId);
  }
  return (await getPendingTripIds(userId)).length + (await getPendingDeleteIds(userId)).length;
}

/** Wysyła do chmury wszystkie lokalne podróże użytkownika (np. przed wylogowaniem). */
export async function pushAllLocalTrips(db: LocalDatabase | null | undefined, fallbackUserId?: string | null): Promise<void> {
  if (!db) return;
  const userId = await getCloudUserId(fallbackUserId);
  if (!userId) return;
  await flushPendingTrips(db, userId);
  try {
    const rows = rowsOf(await db.execute('SELECT id FROM trips WHERE user_id = ?', [userId]));
    for (const row of rows) await pushTripToCloud(db, row.id, userId);
  } catch {}
}
