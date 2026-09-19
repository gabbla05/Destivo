import AsyncStorage from '@react-native-async-storage/async-storage';

// Robustne parsowanie daty z obsługą formatów YYYY-MM-DD, DD-MM-YYYY, kropek, ukośników oraz timestampów ISO
export const parseTripDate = (dateStr?: string | null): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.split(/[T ]/)[0];
  const normalized = dateOnly.replace(/[./]/g, '-');
  const parts = normalized.split('-');

  if (parts.length === 3) {
    let year: number;
    let month: number;
    let day: number;

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    } else {
      return null;
    }

    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
};

export const formatDisplayDate = (d: Date): string => {
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Sprawdza czy dwa zakresy dat nakładają się na siebie.
 * Dwa przedziały [S1, E1] i [S2, E2] nachodzą na siebie wtedy i tylko wtedy, gdy:
 * S1 <= E2 oraz E1 >= S2
 */
export const isDateRangeOverlapping = (
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean => {
  const s1 = start1.getTime();
  const e1 = end1.getTime();
  const s2 = start2.getTime();
  const e2 = end2.getTime();

  return s1 <= e2 && e1 >= s2;
};

export interface CollidingTrip {
  id: string;
  trip_name: string;
  start_date: string;
  end_date: string;
  formattedRange: string;
}

export class TripDateCollisionError extends Error {
  collidingTrip: CollidingTrip;

  constructor(message: string, collidingTrip: CollidingTrip) {
    super(message);
    this.name = 'TripDateCollisionError';
    this.collidingTrip = collidingTrip;
  }
}

/**
 * Sprawdza czy nowo planowana podróż nie nakłada się na jakąkolwiek istniejącą podróż użytkownika.
 * Przeszukuje zarówno lokalną bazę PowerSync (SQLite) jak i pamięć podręczną AsyncStorage.
 */
export const checkTripCollision = async (
  db: any,
  userId: string,
  newStartDateStr: string,
  newEndDateStr: string,
  excludeTripId?: string
): Promise<CollidingTrip | null> => {
  const newStart = parseTripDate(newStartDateStr);
  if (!newStart) return null;
  const newEnd = parseTripDate(newEndDateStr) || newStart;

  const candidateTrips: { id: string; trip_name: string; start_date: string; end_date: string }[] = [];

  // 1. Sprawdzenie w PowerSync / lokalnej bazie SQLite
  if (db && typeof db.execute === 'function') {
    try {
      const result = await db.execute(
        'SELECT id, trip_name, start_date, end_date FROM trips WHERE user_id = ?',
        [userId]
      );
      const rows = ((result as any)?.array || (result as any)?.rows?._array || (result as any)?.rows || []) as any[];
      for (const r of rows) {
        if (excludeTripId && r.id === excludeTripId) continue;
        candidateTrips.push({
          id: r.id,
          trip_name: r.trip_name || r.title || 'Podróż',
          start_date: r.start_date,
          end_date: r.end_date,
        });
      }
    } catch (err) {
      console.warn('Błąd sprawdzania kolizji w SQLite:', err);
    }
  }

  // 2. Sprawdzenie w pamięci podręcznej AsyncStorage
  try {
    const cacheKey = `destivo_cached_trips_${userId}`;
    const cachedStr = await AsyncStorage.getItem(cacheKey);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (Array.isArray(cached)) {
        for (const c of cached) {
          if (excludeTripId && c.id === excludeTripId) continue;
          if (!candidateTrips.some((t) => t.id === c.id)) {
            candidateTrips.push({
              id: c.id,
              trip_name: c.trip_name || c.title || 'Podróż',
              start_date: c.start_date,
              end_date: c.end_date,
            });
          }
        }
      }
    }
  } catch (cacheErr) {
    console.warn('Błąd czytania cache podróży w checkTripCollision:', cacheErr);
  }

  // 3. Sprawdzamy nakładanie się zakresów czasowych
  for (const trip of candidateTrips) {
    const exStart = parseTripDate(trip.start_date);
    if (!exStart) continue;
    const exEnd = parseTripDate(trip.end_date) || exStart;

    if (isDateRangeOverlapping(newStart, newEnd, exStart, exEnd)) {
      const formattedRange =
        exStart.getTime() === exEnd.getTime()
          ? formatDisplayDate(exStart)
          : `${formatDisplayDate(exStart)} - ${formatDisplayDate(exEnd)}`;

      return {
        id: trip.id,
        trip_name: trip.trip_name,
        start_date: formatDisplayDate(exStart),
        end_date: formatDisplayDate(exEnd),
        formattedRange,
      };
    }
  }

  return null;
};
