import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  PLN: 1.0,
  EUR: 4.30,
  USD: 4.00,
  GBP: 5.10,
  CHF: 4.50,
  CZK: 0.17,
  HUF: 0.011,
  JPY: 0.026,
  ISK: 0.029,
  NOK: 0.37,
  SEK: 0.38,
  DKK: 0.58,
  TRY: 0.12,
};

const STORAGE_RATES_KEY = '@destivo_live_exchange_rates';
const STORAGE_TIMESTAMP_KEY = '@destivo_rates_timestamp';

export interface CurrencyRatesData {
  rates: Record<string, number>;
  lastUpdated: Date;
  isLive: boolean;
}

/**
 * Pobiera aktualne kursy walut z otwartego API (open.er-api.com).
 * Jako bazę przyjmuje PLN, a następnie przelicza kursy 1 [WALUTA] = X PLN.
 * Posiada pamięć podręczną AsyncStorage oraz niezawodny fallback offline.
 */
export async function fetchLiveExchangeRates(): Promise<CurrencyRatesData> {
  // 1. Sprawdzenie pamięci podręcznej AsyncStorage
  let cachedRates: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };
  let cachedDate = new Date();

  try {
    const storedRatesJson = await AsyncStorage.getItem(STORAGE_RATES_KEY);
    const storedTimeStr = await AsyncStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (storedRatesJson) {
      cachedRates = { ...DEFAULT_EXCHANGE_RATES, ...JSON.parse(storedRatesJson) };
    }
    if (storedTimeStr) {
      cachedDate = new Date(Number(storedTimeStr));
    }
  } catch (err) {
    console.warn('Błąd odczytu kursów z AsyncStorage:', err);
  }

  // 2. Pobranie kursów na żywo z open.er-api.com (baza PLN)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/PLN', {
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.result === 'success' && data.rates) {
        const freshRates: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };
        freshRates.PLN = 1.0;

        // open.er-api z bazą PLN zwraca: 1 PLN = data.rates[CUR]
        // Zatem 1 [CUR] = 1 / data.rates[CUR] PLN
        Object.keys(DEFAULT_EXCHANGE_RATES).forEach((code) => {
          if (code === 'PLN') return;
          const rateVal = data.rates[code];
          if (typeof rateVal === 'number' && rateVal > 0) {
            freshRates[code] = 1 / rateVal;
          }
        });

        const now = new Date();
        // Zapis do AsyncStorage
        try {
          await AsyncStorage.setItem(STORAGE_RATES_KEY, JSON.stringify(freshRates));
          await AsyncStorage.setItem(STORAGE_TIMESTAMP_KEY, String(now.getTime()));
        } catch (saveErr) {
          console.warn('Błąd zapisu kursów walut do pamięci:', saveErr);
        }

        return {
          rates: freshRates,
          lastUpdated: now,
          isLive: true,
        };
      }
    }
  } catch (fetchErr) {
    // W razie braku sieci lub timeoutu używamy cache lub fallbacku
    console.warn('Brak połączenia z API kursów walut, użyto cache:', fetchErr);
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    rates: cachedRates,
    lastUpdated: cachedDate,
    isLive: false,
  };
}

/**
 * Pobiera zapisane w pamięci podręcznej kursy walut bez blokującego zapytania sieciowego (100% offline).
 * Jeśli brak w pamięci podręcznej, zwraca DEFAULT_EXCHANGE_RATES.
 */
export async function getCachedExchangeRates(): Promise<Record<string, number>> {
  try {
    const storedRatesJson = await AsyncStorage.getItem(STORAGE_RATES_KEY);
    if (storedRatesJson) {
      return { ...DEFAULT_EXCHANGE_RATES, ...JSON.parse(storedRatesJson) };
    }
  } catch (err) {
    console.warn('Błąd odczytu kursów z AsyncStorage:', err);
  }
  return { ...DEFAULT_EXCHANGE_RATES };
}

/**
 * Wykrywa oficjalną walutę kraju/miasta na podstawie nazwy destynacji.
 */
export function getDestinationCurrencyCode(destination?: string): string {
  if (!destination) return 'EUR';
  const d = destination.toLowerCase().trim();

  // Polska
  if (['warszawa', 'warsaw', 'kraków', 'krakow', 'gdańsk', 'gdansk', 'wrocław', 'wroclaw', 'poznań', 'poznan', 'polska', 'poland', 'zakopane', 'sopot', 'lublin', 'katowice', 'szczecin'].some(c => d.includes(c))) {
    return 'PLN';
  }
  // Wielka Brytania
  if (['londyn', 'london', 'uk', 'wielka brytania', 'wielkiej brytanii', 'anglia', 'england', 'szkocja', 'scotland', 'edynburg', 'edinburgh', 'manchester', 'liverpool', 'birmingham'].some(c => d.includes(c))) {
    return 'GBP';
  }
  // Czechy
  if (['praga', 'prague', 'czech', 'czechy', 'ostrawa', 'ostrava', 'brno'].some(c => d.includes(c))) {
    return 'CZK';
  }
  // Węgry
  if (['budapeszt', 'budapest', 'węgry', 'wegry', 'hungary'].some(c => d.includes(c))) {
    return 'HUF';
  }
  // Szwajcaria
  if (['szwajcaria', 'switzerland', 'zurych', 'zurich', 'genewa', 'geneva', 'basel', 'bazylea', 'berno', 'bern'].some(c => d.includes(c))) {
    return 'CHF';
  }
  // Japonia
  if (['tokio', 'tokyo', 'japonia', 'japan', 'kioto', 'kyoto', 'osaka'].some(c => d.includes(c))) {
    return 'JPY';
  }
  // Stany Zjednoczone
  if (['usa', 'nowy jork', 'new york', 'stany zjednoczone', 'united states', 'los angeles', 'chicago', 'miami', 'san francisco', 'las vegas'].some(c => d.includes(c))) {
    return 'USD';
  }
  // Norwegia
  if (['norwegia', 'norway', 'oslo', 'bergen', 'tromso', 'tromsø'].some(c => d.includes(c))) {
    return 'NOK';
  }
  // Szwecja
  if (['szwecja', 'sweden', 'sztokholm', 'stockholm', 'goteborg', 'göteborg', 'malmo', 'malmö'].some(c => d.includes(c))) {
    return 'SEK';
  }
  // Dania
  if (['dania', 'denmark', 'kopenhaga', 'copenhagen'].some(c => d.includes(c))) {
    return 'DKK';
  }
  // Islandia
  if (['islandia', 'iceland', 'reykjavik', 'keflavik'].some(c => d.includes(c))) {
    return 'ISK';
  }
  // Turcja
  if (['turcja', 'turkey', 'stambuł', 'istanbul', 'antalya', 'ankara'].some(c => d.includes(c))) {
    return 'TRY';
  }

  // Domyślnie strefa euro
  return 'EUR';
}

/**
 * Zwraca informację o walucie (kod i kurs w PLN) dla podanej destynacji,
 * korzystając ze zaktualizowanych lub domyślnych kursów walut.
 */
export function getCurrencyInfoForDestination(
  destination?: string,
  rates?: Record<string, number>
): { code: string; ratePln: number } {
  const code = getDestinationCurrencyCode(destination);
  const activeRates = rates || DEFAULT_EXCHANGE_RATES;
  const rawRate = activeRates[code] !== undefined ? activeRates[code] : (DEFAULT_EXCHANGE_RATES[code] ?? 1.0);

  let ratePln = 1.0;
  if (code === 'PLN') {
    ratePln = 1.0;
  } else if (rawRate < 0.1) {
    ratePln = Number(rawRate.toFixed(rawRate < 0.01 ? 4 : 3));
  } else {
    ratePln = Number(rawRate.toFixed(2));
  }

  return { code, ratePln };
}


export function formatRatesUpdatedTime(date: Date | string | number, language: string = 'pl'): string {
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return language === 'pl' ? 'dzisiaj' : 'today';
  }

  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 60));

  if (diffMinutes < 2) {
    return language === 'pl' ? 'przed chwilą' : 'just now';
  }
  if (diffMinutes < 60) {
    return language === 'pl' ? `${diffMinutes} min temu` : `${diffMinutes} min ago`;
  }

  const isToday =
    now.getDate() === parsedDate.getDate() &&
    now.getMonth() === parsedDate.getMonth() &&
    now.getFullYear() === parsedDate.getFullYear();

  const hours = String(parsedDate.getHours()).padStart(2, '0');
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

  if (isToday) {
    return language === 'pl' ? `dzisiaj, ${hours}:${minutes}` : `today, ${hours}:${minutes}`;
  }

  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}, ${hours}:${minutes}`;
}


/**
 * Przelicza kwotę pomiędzy walutami z użyciem zadanych kursów.
 */
export function convertCurrencyWithRates(
  val: string,
  from: string,
  to: string,
  rates: Record<string, number>
): string {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return '';
  const fromRate = rates[from] || 1.0;
  const toRate = rates[to] || 1.0;
  const res = (num * fromRate) / toRate;
  return res >= 100 ? res.toFixed(1) : res.toFixed(2);
}
