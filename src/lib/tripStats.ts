import { parseTripDate } from './tripCollision';

/**
 * Liczba dni podróży liczona włącznie: poniedziałek-środa to 3 dni, wyjazd jednodniowy to 1 dzień.
 * Brak lub błędna data -> 0 (podróż nie jest wliczana).
 */
export function countTripDaysInclusive(startDate?: string | null, endDate?: string | null): number {
  const start = startDate ? parseTripDate(startDate) : null;
  const end = endDate ? parseTripDate(endDate) : null;
  if (!start || !end) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round(Math.abs(endDay - startDay) / dayMs) + 1;
}

/** Suma dni (włącznie) dla listy podróży - statystyka "dni w podróży" w archiwum. */
export function sumTripDays(trips: Array<{ start_date?: string | null; end_date?: string | null }>): number {
  return trips.reduce((total, trip) => total + countTripDaysInclusive(trip.start_date, trip.end_date), 0);
}
