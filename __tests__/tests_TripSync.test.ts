/// <reference types="jest" />
/**
 * Supabase jako główne miejsce danych, lokalna baza jako kopia offline:
 * pełny wiersz w chmurze, kolejka zmian i usunięć zrobionych bez sieci.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const TRIP_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

let mockUpsertResult: { data: any; error: any } = { data: { id: TRIP_ID }, error: null };
let mockDeleteResult: { error: any } = { error: null };
const mockUpsert = jest.fn();
const mockDeleteEq = jest.fn();
let mockSessionUserId: string | null = USER_ID;

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSessionUserId ? { user: { id: mockSessionUserId } } : null } })),
    },
    from: jest.fn(() => ({
      upsert: (rows: any, opts: any) => {
        mockUpsert(rows, opts);
        return { select: () => ({ maybeSingle: async () => mockUpsertResult }) };
      },
      delete: () => ({ eq: async (col: string, id: string) => { mockDeleteEq(col, id); return mockDeleteResult; } }),
    })),
  },
}));

import {
  buildCloudTripRow,
  pushTripToCloud,
  flushPendingTrips,
  deleteTripFromCloud,
  getPendingTripIds,
  getPendingDeleteIds,
  toCloudDate,
} from '../src/lib/tripSync';

const localRow = {
  id: TRIP_ID,
  user_id: USER_ID,
  trip_name: 'Weekend w Krakowie',
  origin: 'Warszawa',
  destination: 'Kraków',
  start_date: '20-11-2026',
  end_date: '2026-11-22',
  transport_data: JSON.stringify({ selectedOption: { type: 'train' }, details: { outboundDepartureTime: '07:15' } }),
  lodging_data: JSON.stringify({ lodgingAddress: 'ul. Floriańska 12', vaultFiles: [{ id: 'f1' }] }),
  attractions_data: JSON.stringify({ customTimeline: [{ id: 'e1' }] }),
};

const makeDb = (rows: any[] = [localRow]) => ({
  execute: jest.fn(async (sql: string, params?: any[]) => {
    if (sql.startsWith('SELECT * FROM trips WHERE id')) {
      return { rows: { _array: rows.filter((r) => r.id === params?.[0]) } };
    }
    if (sql.startsWith('SELECT id FROM trips WHERE user_id')) {
      return { rows: { _array: rows.map((r) => ({ id: r.id })) } };
    }
    return { rows: { _array: [] } };
  }),
});

describe('tripSync — Supabase jako źródło danych, telefon jako kopia offline', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockUpsertResult = { data: { id: TRIP_ID }, error: null };
    mockDeleteResult = { error: null };
    mockSessionUserId = USER_ID;
  });

  test('wiersz w chmurze zawiera pełne dane: transport, nocleg, plan i daty w formacie Postgresa', () => {
    const row = buildCloudTripRow(localRow, USER_ID);
    expect(row).toEqual(expect.objectContaining({
      id: TRIP_ID,
      user_id: USER_ID,
      title: 'Weekend w Krakowie',
      start_date: '2026-11-20',
      end_date: '2026-11-22',
      transport_type: 'train',
      accommodation_address: 'ul. Floriańska 12',
    }));
    expect(JSON.parse(row.transport_data).details.outboundDepartureTime).toBe('07:15');
    expect(JSON.parse(row.lodging_data).vaultFiles).toHaveLength(1);
    expect(JSON.parse(row.attractions_data).customTimeline).toHaveLength(1);
    expect(toCloudDate('5.3.2027')).toBe('2027-03-05');
    expect(toCloudDate('')).toBeNull();
  });

  test('udany zapis wysyła cały wiersz (upsert po id) i niczego nie kolejkuje', async () => {
    const ok = await pushTripToCloud(makeDb(), TRIP_ID);
    expect(ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith([expect.objectContaining({ id: TRIP_ID, transport_data: localRow.transport_data })], { onConflict: 'id' });
    expect(await getPendingTripIds(USER_ID)).toEqual([]);
  });

  test('bez sieci zmiana trafia do kolejki, a po powrocie internetu jest wysyłana', async () => {
    mockUpsertResult = { data: null, error: { message: 'Network request failed' } };
    const db = makeDb();
    expect(await pushTripToCloud(db, TRIP_ID)).toBe(false);
    expect(await getPendingTripIds(USER_ID)).toEqual([TRIP_ID]);

    mockUpsertResult = { data: { id: TRIP_ID }, error: null };
    const remaining = await flushPendingTrips(db, USER_ID);
    expect(remaining).toBe(0);
    expect(await getPendingTripIds(USER_ID)).toEqual([]);
  });

  test('brak potwierdzenia z bazy (np. odrzucenie przez RLS) też jest traktowany jak niewysłane', async () => {
    mockUpsertResult = { data: null, error: null };
    expect(await pushTripToCloud(makeDb(), TRIP_ID)).toBe(false);
    expect(await getPendingTripIds(USER_ID)).toEqual([TRIP_ID]);
  });

  test('gość (brak sesji) nie wysyła niczego do chmury i niczego nie kolejkuje', async () => {
    mockSessionUserId = null;
    expect(await pushTripToCloud(makeDb(), TRIP_ID, 'guest')).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(await getPendingTripIds(USER_ID)).toEqual([]);
  });

  test('usunięcie bez sieci jest zapamiętane i wykonane przy następnej synchronizacji', async () => {
    mockDeleteResult = { error: { message: 'Network request failed' } };
    expect(await deleteTripFromCloud(TRIP_ID)).toBe(false);
    expect(await getPendingDeleteIds(USER_ID)).toEqual([TRIP_ID]);

    mockDeleteResult = { error: null };
    await flushPendingTrips(makeDb([]), USER_ID);
    expect(mockDeleteEq).toHaveBeenLastCalledWith('id', TRIP_ID);
    expect(await getPendingDeleteIds(USER_ID)).toEqual([]);
  });

  test('podróż usunięta lokalnie znika z kolejki zamiast wracać do chmury', async () => {
    await AsyncStorage.setItem(`destivo_sync_pending_${USER_ID}`, JSON.stringify([TRIP_ID]));
    await flushPendingTrips(makeDb([]), USER_ID);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(await getPendingTripIds(USER_ID)).toEqual([]);
  });
});
