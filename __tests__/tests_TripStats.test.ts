/// <reference types="jest" />
// P15: statystyka "dni w podróży" liczy dni włącznie.
import { countTripDaysInclusive, sumTripDays } from '../src/lib/tripStats';

describe('Liczenie dni podróży', () => {
  test('poniedziałek-środa to 3 dni, wyjazd jednodniowy to 1 dzień', () => {
    expect(countTripDaysInclusive('09-11-2026', '11-11-2026')).toBe(3);
    expect(countTripDaysInclusive('09-11-2026', '09-11-2026')).toBe(1);
  });

  test('przejście na czas zimowy nie zmienia wyniku', () => {
    expect(countTripDaysInclusive('24-10-2026', '26-10-2026')).toBe(3);
  });

  test('brak daty -> podróż nie jest wliczana', () => {
    expect(countTripDaysInclusive(undefined, '11-11-2026')).toBe(0);
  });

  test('suma dla archiwum', () => {
    expect(
      sumTripDays([
        { start_date: '01-10-2026', end_date: '03-10-2026' },
        { start_date: '10-10-2026', end_date: '10-10-2026' },
      ])
    ).toBe(4);
  });
});
