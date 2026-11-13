/// <reference types="jest" />
// P7: użytkownik widzi, skąd pochodzi kurs (na żywo / z pamięci offline / orientacyjny).
import AsyncStorage from '@react-native-async-storage/async-storage';
// jest.setup.js podmienia fetchLiveExchangeRates na atrapę - tu testujemy prawdziwą implementację
const {
  fetchLiveExchangeRates,
  getCachedExchangeRatesInfo,
  describeRatesSource,
  DEFAULT_EXCHANGE_RATES,
} = jest.requireActual('../src/lib/currencyService') as typeof import('../src/lib/currencyService');

describe('Źródło kursów walut', () => {
  const originalFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  test('kurs pobrany na żywo ma źródło "live" i bieżący czas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { EUR: 0.25, USD: 0.27 } }),
    }) as any;

    const data = await fetchLiveExchangeRates();
    expect(data.source).toBe('live');
    expect(data.rates.EUR).toBeCloseTo(4);
    expect(data.lastUpdated).toBeInstanceOf(Date);
    expect(describeRatesSource(data.source, data.lastUpdated, 'pl')).toBe('kurs z przed chwilą');
  });

  test('bez sieci, z zapisanym kursem: źródło "cache" z datą zapisu i dopiskiem offline', async () => {
    const savedAt = new Date('2026-11-12T18:30:00');
    await AsyncStorage.setItem('@destivo_live_exchange_rates', JSON.stringify({ EUR: 4.25 }));
    await AsyncStorage.setItem('@destivo_rates_timestamp', String(savedAt.getTime()));
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const data = await fetchLiveExchangeRates();
    expect(data.source).toBe('cache');
    expect(data.rates.EUR).toBe(4.25);
    expect(data.lastUpdated?.getTime()).toBe(savedAt.getTime());
    expect(describeRatesSource(data.source, data.lastUpdated, 'pl')).toMatch(/^kurs z 12\.11, 18:30 \(offline\)$/);
  });

  test('bez sieci i bez zapisanego kursu: kurs domyślny bez daty, opisany jako orientacyjny', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const data = await fetchLiveExchangeRates();
    expect(data.source).toBe('default');
    expect(data.lastUpdated).toBeNull();
    expect(data.rates).toEqual(DEFAULT_EXCHANGE_RATES);
    expect(describeRatesSource(data.source, data.lastUpdated, 'pl')).toBe('kurs orientacyjny, brak połączenia');
    expect(describeRatesSource(data.source, data.lastUpdated, 'en')).toBe('approximate rate, no connection');
  });

  test('getCachedExchangeRatesInfo działa bez sieci', async () => {
    global.fetch = jest.fn();
    expect((await getCachedExchangeRatesInfo()).source).toBe('default');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
