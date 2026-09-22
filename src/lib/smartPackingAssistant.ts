// src/lib/smartPackingAssistant.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseTripDate } from './tripCollision';
import { translations } from '../i18n/translations';

export type PackingCategory =
  | 'transport'
  | 'weather'
  | 'clothing'
  | 'toiletries'
  | 'electronics'
  | 'documents'
  | 'custom';

export interface PackingItem {
  id: string;
  category: PackingCategory;
  title: string;
  quantity?: number;
  unit?: string;
  reason: string;
  checked: boolean;
  isCustom?: boolean;
  isWarning?: boolean;
  icon?: string;
}

export interface WeatherCondition {
  temp: number;
  isRain: boolean;
  condition: string;
  isEstimated?: boolean;
  source?: string;
}

export interface PackingListParams {
  tripId?: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  transportType?: string;
  weather?: WeatherCondition;
  language?: 'pl' | 'en';
}

export interface PackingAssistantData {
  tripId: string;
  destination: string;
  durationDays: number;
  transportType: 'flight' | 'car' | 'train' | 'bus' | 'other';
  weather: WeatherCondition;
  items: PackingItem[];
  packedCount: number;
  totalCount: number;
  progressPercent: number;
  lastUpdated: string;
}

const STORAGE_PREFIX = 'destivo_packing_list_';

/**
 * Normalizuje środek transportu do jednego ze zdefiniowanych typów
 */
export const normalizeTransportType = (
  rawType?: string
): 'flight' | 'car' | 'train' | 'bus' | 'other' => {
  if (!rawType || typeof rawType !== 'string') return 'flight';
  const t = rawType.toLowerCase().trim();
  if (t.includes('flight') || t.includes('samolot') || t.includes('lot') || t.includes('plane') || t.includes('air')) {
    return 'flight';
  }
  if (t.includes('bus') || t.includes('autobus') || t.includes('autokar') || t.includes('coach')) {
    return 'bus';
  }
  if (t.includes('train') || t.includes('pociąg') || t.includes('pociag') || t.includes('kolej') || t.includes('rail')) {
    return 'train';
  }
  if (t.includes('car') || t.includes('samochód') || t.includes('samochod') || t.includes('auto') || t.includes('drive')) {
    return 'car';
  }
  return 'other';
};

/**
 * Oblicza długość trwania podróży w pełnych dobach/dniach
 */
export const calculateTripDurationDays = (startDate?: string, endDate?: string): number => {
  if (!startDate) return 3; // Bezpieczny domyślny czas na city-break
  const start = parseTripDate(startDate);
  const end = endDate ? parseTripDate(endDate) : start;

  if (!start) return 3;
  if (!end || end.getTime() < start.getTime()) return 1;

  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(days, 60)); // Ograniczenie 1-60 dni
};

/**
 * Baza klimatyczna dla popularnych kierunków (fallback offline)
 */
export const getClimaticDefaultWeather = (
  destination: string,
  targetDate?: Date,
  language: 'pl' | 'en' = 'pl'
): WeatherCondition => {
  const d = (destination || '').toLowerCase().trim();
  const month = targetDate ? targetDate.getMonth() : new Date().getMonth(); // 0 = styczeń, 6 = lipiec
  const t = translations[language]?.smartPacking || translations.pl.smartPacking;

  // Kraje i miasta śródziemnomorskie (Włochy, Hiszpania, Portugalia, Grecja)
  const isMediterranean = [
    'rzym', 'rome', 'barcelona', 'madryt', 'madrid', 'lizbona', 'lisbon',
    'wenecja', 'venice', 'ateny', 'athens', 'włochy', 'italy', 'hiszpania', 'spain'
  ].some(k => d.includes(k));

  // Kraje deszczowe / wyspiarskie (Wielka Brytania, Irlandia, Holandia)
  const isRainyRegion = [
    'londyn', 'london', 'edynburg', 'edinburgh', 'dublin', 'amsterdam', 'uk', 'wielka brytania', 'irlandia'
  ].some(k => d.includes(k));

  // Kraje chłodne / alpejskie / północne (Skandynawia, góry)
  const isColdRegion = [
    'oslo', 'sztokholm', 'stockholm', 'helsinki', 'zakopane', 'reykjavik', 'islandia', 'norwegia'
  ].some(k => d.includes(k));

  // Miesiące zimowe (listopad, grudzień, styczeń, luty, marzec)
  const isWinter = month === 11 || month === 0 || month === 1 || month === 2;
  const isSummer = month >= 5 && month <= 8;

  if (isColdRegion) {
    if (isWinter) {
      return { temp: -2, isRain: false, condition: t.weatherColdSnow || 'Mroźno, możliwe opady śniegu', isEstimated: true };
    }
    return { temp: 14, isRain: true, condition: t.weatherChillyRain || 'Rześko, przelotny deszcz', isEstimated: true };
  }

  if (isRainyRegion) {
    if (isSummer) {
      return { temp: 20, isRain: true, condition: t.weatherModerateRain || 'Umiarkowanie, przelotny deszcz', isEstimated: true };
    }
    return { temp: 9, isRain: true, condition: t.weatherColdRain || 'Chłodno i deszczowo', isEstimated: true };
  }

  if (isMediterranean) {
    if (isSummer) {
      return { temp: 29, isRain: false, condition: t.weatherSunnyHot || 'Słonecznie i gorąco', isEstimated: true };
    }
    if (isWinter) {
      return { temp: 12, isRain: false, condition: t.weatherMildMedWinter || 'Łagodna zima śródziemnomorska', isEstimated: true };
    }
    return { temp: 21, isRain: false, condition: t.weatherPleasantSunny || 'Przyjemnie i słonecznie', isEstimated: true };
  }

  // Domyślny klimat kontynentalny (Polska, Europa Środkowa)
  if (isSummer) {
    return { temp: 24, isRain: false, condition: t.weatherWarmSummer || 'Ciepłe lato kontynentalne', isEstimated: true };
  }
  if (isWinter) {
    return { temp: 2, isRain: false, condition: t.weatherColdContinentalWinter || 'Chłodna zima kontynentalna', isEstimated: true };
  }
  return { temp: 14, isRain: false, condition: t.weatherModerateTransitional || 'Umiarkowana pogoda przejściowa', isEstimated: true };
};

/**
 * Pobiera prognozę pogody dla wybranej destynacji (z timeoutem i automatycznym fallbackiem offline)
 */
export const fetchTripWeatherForecast = async (
  destination: string,
  startDate?: string
): Promise<WeatherCondition> => {
  const targetDate = startDate ? parseTripDate(startDate) || new Date() : new Date();
  const fallback = getClimaticDefaultWeather(destination, targetDate);

  if (!destination || !destination.trim()) {
    return fallback;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2800);

  try {
    // 1. Próba znalezienia współrzędnych przez darmowe geokodowanie Nominatim
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=1`,
      {
        headers: { 'User-Agent': 'DestivoApp-Packing/1.0' },
        signal: controller.signal,
      }
    );
    if (!geoRes.ok) throw new Error('Geocoding failed');
    const geoData = await geoRes.json();

    if (!Array.isArray(geoData) || geoData.length === 0) {
      clearTimeout(timeoutId);
      return fallback;
    }

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // 2. Pobranie prognozy z bezpłatnego Open-Meteo API (nie wymaga klucza, działa globalnie)
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=auto`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!weatherRes.ok) return fallback;
    const weatherData = await weatherRes.json();

    if (weatherData?.daily?.temperature_2m_max && weatherData.daily.temperature_2m_max.length > 0) {
      const maxTemp = Math.round(weatherData.daily.temperature_2m_max[0]);
      const precipProb = weatherData.daily.precipitation_probability_max?.[0] || 0;
      const weatherCode = weatherData.daily.weathercode?.[0] || 0;

      // Kody WMO: 51-67 (mżawka, deszcz), 80-82 (ulewa), 95-99 (burza)
      const isRainyCode = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 99);
      const isRain = isRainyCode || precipProb >= 45;

      let condition = 'Słonecznie';
      if (weatherCode >= 95) condition = 'Burze z deszczem';
      else if (isRain) condition = 'Przelotne opady deszczu';
      else if (weatherCode >= 1 && weatherCode <= 3) condition = 'Częściowe zachmurzenie';
      else if (maxTemp < 10) condition = 'Chłodno, bez opadów';
      else if (maxTemp >= 24) condition = 'Słonecznie i ciepło';

      return {
        temp: maxTemp,
        isRain,
        condition,
        isEstimated: false,
        source: 'Open-Meteo',
      };
    }
  } catch {
    clearTimeout(timeoutId);
    // W przypadku błędu sieci, braku internetu lub timeoutu - zwracamy inteligentny fallback klimatyczny
  }

  return fallback;
};

/**
 * Sprawdza, czy w danym kraju/mieście potrzebny jest adapter gniazdkowy
 */
const needsPowerAdapter = (dest: string, language: 'pl' | 'en' = 'pl'): { needed: boolean; type: string } => {
  const d = dest.toLowerCase();
  const t = translations[language]?.smartPacking || translations.pl.smartPacking;
  if (['uk', 'wielka brytania', 'anglia', 'londyn', 'london', 'szkocja', 'edinburgh', 'irlandia', 'dublin'].some(k => d.includes(k))) {
    return { needed: true, type: t.adapterTypeG || 'Typ G (Wielka Brytania / UK)' };
  }
  if (['usa', 'stany zjednoczone', 'nowy jork', 'new york', 'miami', 'los angeles', 'kanada', 'canada'].some(k => d.includes(k))) {
    return { needed: true, type: t.adapterTypeAB || 'Typ A/B (USA i Kanada)' };
  }
  if (['japonia', 'tokio', 'tokyo', 'japan'].some(k => d.includes(k))) {
    return { needed: true, type: t.adapterTypeA || 'Typ A (Japonia)' };
  }
  if (['australia', 'sydney', 'melbourne'].some(k => d.includes(k))) {
    return { needed: true, type: t.adapterTypeI || 'Typ I (Australia)' };
  }
  if (['szwajcaria', 'switzerland', 'zurych', 'zurich', 'genewa'].some(k => d.includes(k))) {
    return { needed: true, type: t.adapterTypeJ || 'Typ J (Szwajcaria)' };
  }
  return { needed: false, type: '' };
};

/**
 * Główny generator dynamicznej listy pakowania
 */
export const generatePackingList = (params: PackingListParams): PackingItem[] => {
  const duration = calculateTripDurationDays(params.startDate, params.endDate);
  const transport = normalizeTransportType(params.transportType);
  const dest = params.destination || '';
  const lang = params.language || 'pl';

  const t = translations[lang]?.smartPacking || translations.pl.smartPacking;
  const tItems = t.items || translations.pl.smartPacking.items;
  const tUnits = t.units || translations.pl.smartPacking.units;

  const weather = params.weather || getClimaticDefaultWeather(dest, params.startDate ? parseTripDate(params.startDate) || new Date() : new Date(), lang);
  const items: PackingItem[] = [];

  // =========================================================================
  // 1. KATEGORIA: TRANSPORT & BAGAŻ (oparte na środku transportu)
  // =========================================================================
  if (transport === 'flight') {
    items.push({
      id: 'flight-liquids',
      category: 'transport',
      title: tItems['flight-liquids'].title,
      reason: tItems['flight-liquids'].reason,
      checked: false,
      isWarning: true,
      icon: 'water-outline',
    });

    items.push({
      id: 'flight-bag-1l',
      category: 'transport',
      title: tItems['flight-bag-1l'].title,
      reason: tItems['flight-bag-1l'].reason,
      checked: false,
      icon: 'bag-check-outline',
    });

    items.push({
      id: 'flight-luggage-size',
      category: 'transport',
      title: tItems['flight-luggage-size'].title,
      reason: tItems['flight-luggage-size'].reason,
      checked: false,
      isWarning: true,
      icon: 'briefcase-outline',
    });

    items.push({
      id: 'flight-powerbank',
      category: 'transport',
      title: tItems['flight-powerbank'].title,
      reason: tItems['flight-powerbank'].reason,
      checked: false,
      isWarning: true,
      icon: 'battery-charging-outline',
    });

    items.push({
      id: 'flight-boarding-pass',
      category: 'transport',
      title: tItems['flight-boarding-pass'].title,
      reason: tItems['flight-boarding-pass'].reason,
      checked: false,
      icon: 'airplane-outline',
    });

    items.push({
      id: 'flight-neck-pillow',
      category: 'transport',
      title: tItems['flight-neck-pillow'].title,
      reason: tItems['flight-neck-pillow'].reason,
      checked: false,
      icon: 'headset-outline',
    });
  } else if (transport === 'car') {
    items.push({
      id: 'car-safety-vests',
      category: 'transport',
      title: tItems['car-safety-vests'].title,
      reason: tItems['car-safety-vests'].reason,
      checked: false,
      isWarning: true,
      icon: 'shield-outline',
    });

    items.push({
      id: 'car-emergency-kit',
      category: 'transport',
      title: tItems['car-emergency-kit'].title,
      reason: tItems['car-emergency-kit'].reason,
      checked: false,
      icon: 'warning-outline',
    });

    items.push({
      id: 'car-phone-charger',
      category: 'transport',
      title: tItems['car-phone-charger'].title,
      reason: tItems['car-phone-charger'].reason,
      checked: false,
      icon: 'navigate-outline',
    });

    items.push({
      id: 'car-docs',
      category: 'transport',
      title: tItems['car-docs'].title,
      reason: tItems['car-docs'].reason,
      checked: false,
      icon: 'document-text-outline',
    });

    items.push({
      id: 'car-vignettes',
      category: 'transport',
      title: tItems['car-vignettes'].title,
      reason: tItems['car-vignettes'].reason,
      checked: false,
      icon: 'card-outline',
    });
  } else if (transport === 'train') {
    items.push({
      id: 'train-ticket-offline',
      category: 'transport',
      title: tItems['train-ticket-offline'].title,
      reason: tItems['train-ticket-offline'].reason,
      checked: false,
      icon: 'ticket-outline',
    });

    items.push({
      id: 'train-headphones',
      category: 'transport',
      title: tItems['train-headphones'].title,
      reason: tItems['train-headphones'].reason,
      checked: false,
      icon: 'headset-outline',
    });

    items.push({
      id: 'train-snacks',
      category: 'transport',
      title: tItems['train-snacks'].title,
      reason: tItems['train-snacks'].reason,
      checked: false,
      icon: 'cafe-outline',
    });
  } else if (transport === 'bus') {
    items.push({
      id: 'bus-ticket-offline',
      category: 'transport',
      title: tItems['bus-ticket-offline'].title,
      reason: tItems['bus-ticket-offline'].reason,
      checked: false,
      icon: 'ticket-outline',
    });

    items.push({
      id: 'bus-comfort-kit',
      category: 'transport',
      title: tItems['bus-comfort-kit'].title,
      reason: tItems['bus-comfort-kit'].reason,
      checked: false,
      icon: 'moon-outline',
    });

    items.push({
      id: 'bus-hygiene',
      category: 'transport',
      title: tItems['bus-hygiene'].title,
      reason: tItems['bus-hygiene'].reason,
      checked: false,
      icon: 'hand-left-outline',
    });
  }

  // =========================================================================
  // 2. KATEGORIA: POGODA & OCHRONA (oparte na temperaturze i opadach)
  // =========================================================================
  if (weather.isRain) {
    items.push({
      id: 'weather-umbrella',
      category: 'weather',
      title: tItems['weather-umbrella'].title,
      reason: tItems['weather-umbrella'].reason.replace('{{dest}}', dest || (lang === 'pl' ? 'docelowym' : 'destination')),
      checked: false,
      icon: 'umbrella-outline',
    });

    items.push({
      id: 'weather-rain-jacket',
      category: 'weather',
      title: tItems['weather-rain-jacket'].title,
      reason: tItems['weather-rain-jacket'].reason,
      checked: false,
      icon: 'rainy-outline',
    });

    items.push({
      id: 'weather-waterproof-shoes',
      category: 'weather',
      title: tItems['weather-waterproof-shoes'].title,
      reason: tItems['weather-waterproof-shoes'].reason,
      checked: false,
      icon: 'footsteps-outline',
    });

    items.push({
      id: 'weather-waterproof-pouch',
      category: 'weather',
      title: tItems['weather-waterproof-pouch'].title,
      reason: tItems['weather-waterproof-pouch'].reason,
      checked: false,
      icon: 'shield-outline',
    });
  }

  if (weather.temp < 10) {
    items.push({
      id: 'weather-warm-jacket',
      category: 'weather',
      title: tItems['weather-warm-jacket'].title,
      reason: tItems['weather-warm-jacket'].reason.replace('{{temp}}', String(weather.temp)),
      checked: false,
      icon: 'snow-outline',
    });

    items.push({
      id: 'weather-winter-hat-scarf',
      category: 'weather',
      title: tItems['weather-winter-hat-scarf'].title,
      reason: tItems['weather-winter-hat-scarf'].reason,
      checked: false,
      icon: 'thermometer-outline',
    });

    items.push({
      id: 'weather-warm-sweater',
      category: 'weather',
      title: tItems['weather-warm-sweater'].title,
      quantity: Math.max(1, Math.min(Math.round(duration / 3), 3)),
      unit: tUnits.pcs,
      reason: tItems['weather-warm-sweater'].reason.replace('{{temp}}', String(weather.temp)),
      checked: false,
      icon: 'shirt-outline',
    });

    items.push({
      id: 'weather-thermal-underwear',
      category: 'weather',
      title: tItems['weather-thermal-underwear'].title,
      reason: tItems['weather-thermal-underwear'].reason,
      checked: false,
      icon: 'body-outline',
    });

    items.push({
      id: 'weather-lip-balm',
      category: 'weather',
      title: tItems['weather-lip-balm'].title,
      reason: tItems['weather-lip-balm'].reason,
      checked: false,
      icon: 'heart-outline',
    });
  } else if (weather.temp >= 22) {
    items.push({
      id: 'weather-sunscreen',
      category: 'weather',
      title: tItems['weather-sunscreen'].title,
      reason: tItems['weather-sunscreen'].reason.replace('{{temp}}', String(weather.temp)),
      checked: false,
      icon: 'sunny-outline',
    });

    items.push({
      id: 'weather-sunglasses',
      category: 'weather',
      title: tItems['weather-sunglasses'].title,
      reason: tItems['weather-sunglasses'].reason,
      checked: false,
      icon: 'glasses-outline',
    });

    items.push({
      id: 'weather-sun-hat',
      category: 'weather',
      title: tItems['weather-sun-hat'].title,
      reason: tItems['weather-sun-hat'].reason,
      checked: false,
      icon: 'sunny-outline',
    });

    items.push({
      id: 'weather-swimwear',
      category: 'weather',
      title: tItems['weather-swimwear'].title,
      reason: tItems['weather-swimwear'].reason.replace('{{temp}}', String(weather.temp)),
      checked: false,
      icon: 'water-outline',
    });

    items.push({
      id: 'weather-water-bottle',
      category: 'weather',
      title: tItems['weather-water-bottle'].title,
      reason: tItems['weather-water-bottle'].reason,
      checked: false,
      icon: 'fitness-outline',
    });
  } else {
    items.push({
      id: 'weather-light-jacket',
      category: 'weather',
      title: tItems['weather-light-jacket'].title,
      reason: tItems['weather-light-jacket'].reason.replace('{{temp}}', String(weather.temp)),
      checked: false,
      icon: 'shirt-outline',
    });

    items.push({
      id: 'weather-cardigan-hoodie',
      category: 'weather',
      title: tItems['weather-cardigan-hoodie'].title,
      reason: tItems['weather-cardigan-hoodie'].reason,
      checked: false,
      icon: 'shirt-outline',
    });
  }

  // =========================================================================
  // 3. KATEGORIA: ODZIEŻ & KOMPLETY (oparte na liczbie dni wyjazdu)
  // =========================================================================
  const underwearCount = duration + 1;
  items.push({
    id: 'clothing-underwear',
    category: 'clothing',
    title: tItems['clothing-underwear'].title,
    quantity: underwearCount,
    unit: tUnits.pcs,
    reason: tItems['clothing-underwear'].reason.replace('{{days}}', String(duration)),
    checked: false,
    icon: 'body-outline',
  });

  const socksCount = duration + 1;
  items.push({
    id: 'clothing-socks',
    category: 'clothing',
    title: tItems['clothing-socks'].title,
    quantity: socksCount,
    unit: tUnits.pairs,
    reason: tItems['clothing-socks'].reason.replace('{{days}}', String(duration)),
    checked: false,
    icon: 'footsteps-outline',
  });

  const tshirtsCount = Math.min(duration + 1, 10);
  items.push({
    id: 'clothing-tshirts',
    category: 'clothing',
    title: tItems['clothing-tshirts'].title,
    quantity: tshirtsCount,
    unit: tUnits.pcs,
    reason: tItems['clothing-tshirts'].reason.replace('{{days}}', String(duration)),
    checked: false,
    icon: 'shirt-outline',
  });

  const pantsCount = duration <= 2 ? 2 : duration <= 5 ? 3 : 4;
  items.push({
    id: 'clothing-pants',
    category: 'clothing',
    title: weather.temp >= 23 ? tItems['clothing-pants-warm'].title : tItems['clothing-pants-default'].title,
    quantity: pantsCount,
    unit: tUnits.pcs,
    reason: tItems['clothing-pants-default'].reason.replace('{{days}}', String(duration)),
    checked: false,
    icon: 'cut-outline',
  });

  const sleepwearCount = duration <= 3 ? 1 : 2;
  items.push({
    id: 'clothing-sleepwear',
    category: 'clothing',
    title: tItems['clothing-sleepwear'].title,
    quantity: sleepwearCount,
    unit: tUnits.set,
    reason: tItems['clothing-sleepwear'].reason.replace('{{days}}', String(duration)),
    checked: false,
    icon: 'moon-outline',
  });

  items.push({
    id: 'clothing-shoes',
    category: 'clothing',
    title: tItems['clothing-shoes'].title,
    quantity: 1,
    unit: tUnits.pair,
    reason: tItems['clothing-shoes'].reason,
    checked: false,
    icon: 'footsteps-outline',
  });

  // =========================================================================
  // 4. KATEGORIA: KOSMETYCZKA & ZDROWIE
  // =========================================================================
  items.push({
    id: 'toiletries-toothbrush',
    category: 'toiletries',
    title: tItems['toiletries-toothbrush'].title,
    reason: tItems['toiletries-toothbrush'].reason,
    checked: false,
    icon: 'sparkles-outline',
  });

  items.push({
    id: 'toiletries-gel-shampoo',
    category: 'toiletries',
    title: tItems['toiletries-gel-shampoo-flight'].title,
    reason: transport === 'flight' ? tItems['toiletries-gel-shampoo-flight'].reason : tItems['toiletries-gel-shampoo-other'].reason,
    checked: false,
    icon: 'water-outline',
  });

  items.push({
    id: 'toiletries-deodorant',
    category: 'toiletries',
    title: tItems['toiletries-deodorant'].title,
    reason: tItems['toiletries-deodorant'].reason,
    checked: false,
    icon: 'shield-checkmark-outline',
  });

  items.push({
    id: 'toiletries-first-aid',
    category: 'toiletries',
    title: tItems['toiletries-first-aid'].title,
    reason: tItems['toiletries-first-aid'].reason,
    checked: false,
    isWarning: true,
    icon: 'medkit-outline',
  });

  items.push({
    id: 'toiletries-tissues',
    category: 'toiletries',
    title: tItems['toiletries-tissues'].title,
    reason: tItems['toiletries-tissues'].reason,
    checked: false,
    icon: 'hand-left-outline',
  });

  // =========================================================================
  // 5. KATEGORIA: ELEKTRONIKA & DOKUMENTY
  // =========================================================================
  items.push({
    id: 'electronics-charger',
    category: 'electronics',
    title: tItems['electronics-charger'].title,
    reason: tItems['electronics-charger'].reason,
    checked: false,
    icon: 'phone-portrait-outline',
  });

  items.push({
    id: 'electronics-powerbank-gen',
    category: 'electronics',
    title: tItems['electronics-powerbank-gen'].title,
    reason: tItems['electronics-powerbank-gen'].reason,
    checked: false,
    icon: 'battery-charging-outline',
  });

  const adapterCheck = needsPowerAdapter(dest, lang);
  if (adapterCheck.needed) {
    items.push({
      id: 'electronics-adapter',
      category: 'electronics',
      title: tItems['electronics-adapter'].title.replace('{{type}}', adapterCheck.type),
      reason: tItems['electronics-adapter'].reason.replace('{{dest}}', dest),
      checked: false,
      isWarning: true,
      icon: 'flash-outline',
    });
  }

  items.push({
    id: 'docs-id-passport',
    category: 'documents',
    title: tItems['docs-id-passport'].title,
    reason: tItems['docs-id-passport'].reason,
    checked: false,
    isWarning: true,
    icon: 'document-text-outline',
  });

  items.push({
    id: 'docs-card-cash',
    category: 'documents',
    title: tItems['docs-card-cash'].title,
    reason: tItems['docs-card-cash'].reason,
    checked: false,
    icon: 'card-outline',
  });

  return items;
};

/**
 * Ładuje asystenta pakowania dla konkretnej podróży:
 * - Jeśli lista jest zapisana w pamięci lokalnej (AsyncStorage), wczytuje stan z zachowaniem zaznaczeń użytkownika i pozycji własnych
 * - Jeśli brak, generuje listę na podstawie parametrów i zapisuje
 */
export const loadPackingAssistant = async (params: PackingListParams): Promise<PackingAssistantData> => {
  const tripId = params.tripId || 'default-trip';
  const storageKey = `${STORAGE_PREFIX}${tripId}`;
  const durationDays = calculateTripDurationDays(params.startDate, params.endDate);
  const transportType = normalizeTransportType(params.transportType);
  const dest = params.destination || '';

  // 1. Sprawdzamy czy mamy już zapisany stan w pamięci
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed: PackingAssistantData = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        // Obliczamy aktualne statystyki
        const packedCount = parsed.items.filter(i => i.checked).length;
        const totalCount = parsed.items.length;
        const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;
        return {
          ...parsed,
          packedCount,
          totalCount,
          progressPercent,
        };
      }
    }
  } catch {
    // Ignorujemy błędy odczytu pamięci
  }

  // 2. Jeśli brak zapisanego stanu, pobieramy pogodę i generujemy nową listę
  let weather = params.weather;
  if (!weather) {
    weather = await fetchTripWeatherForecast(dest, params.startDate);
  }

  const generatedItems = generatePackingList({
    ...params,
    weather,
  });

  const packedCount = generatedItems.filter(i => i.checked).length;
  const totalCount = generatedItems.length;
  const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

  const data: PackingAssistantData = {
    tripId,
    destination: dest,
    durationDays,
    transportType,
    weather,
    items: generatedItems,
    packedCount,
    totalCount,
    progressPercent,
    lastUpdated: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Ignorujemy błędy zapisu pamięci
  }

  return data;
};

/**
 * Zapisuje aktualny stan asystenta pakowania do pamięci podręcznej
 */
export const savePackingAssistant = async (data: PackingAssistantData): Promise<void> => {
  if (!data?.tripId) return;
  const storageKey = `${STORAGE_PREFIX}${data.tripId}`;
  try {
    const packedCount = data.items.filter(i => i.checked).length;
    const totalCount = data.items.length;
    const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

    const payload: PackingAssistantData = {
      ...data,
      packedCount,
      totalCount,
      progressPercent,
      lastUpdated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save packing assistant data:', err);
  }
};

/**
 * Przełącza stan spakowania (zaznaczony/odznaczony) pojedynczego przedmiotu
 */
export const togglePackingItem = async (
  tripId: string,
  itemId: string
): Promise<PackingAssistantData | null> => {
  const storageKey = `${STORAGE_PREFIX}${tripId}`;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const data: PackingAssistantData = JSON.parse(raw);
    const updatedItems = data.items.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    const packedCount = updatedItems.filter(i => i.checked).length;
    const totalCount = updatedItems.length;
    const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

    const updatedData: PackingAssistantData = {
      ...data,
      items: updatedItems,
      packedCount,
      totalCount,
      progressPercent,
      lastUpdated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedData));
    return updatedData;
  } catch {
    return null;
  }
};

/**
 * Dodaje własną pozycję do listy pakowania
 */
export const addCustomPackingItem = async (
  tripId: string,
  title: string,
  category: PackingCategory = 'custom',
  language: 'pl' | 'en' = 'pl'
): Promise<PackingAssistantData | null> => {
  if (!title || !title.trim()) return null;
  const storageKey = `${STORAGE_PREFIX}${tripId}`;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const data: PackingAssistantData = JSON.parse(raw);

    const t = translations[language]?.smartPacking || translations.pl.smartPacking;
    const newItem: PackingItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      category,
      title: title.trim(),
      reason: t.customItemDefaultReason || (language === 'pl' ? 'Dodano ręcznie przez Ciebie' : 'Added manually by you'),
      checked: false,
      isCustom: true,
      icon: 'bookmark-outline',
    };

    const updatedItems = [newItem, ...data.items];
    const packedCount = updatedItems.filter(i => i.checked).length;
    const totalCount = updatedItems.length;
    const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

    const updatedData: PackingAssistantData = {
      ...data,
      items: updatedItems,
      packedCount,
      totalCount,
      progressPercent,
      lastUpdated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedData));
    return updatedData;
  } catch {
    return null;
  }
};

/**
 * Usuwa pozycję z listy pakowania (np. własną pozycję)
 */
export const deletePackingItem = async (
  tripId: string,
  itemId: string
): Promise<PackingAssistantData | null> => {
  const storageKey = `${STORAGE_PREFIX}${tripId}`;
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const data: PackingAssistantData = JSON.parse(raw);

    const updatedItems = data.items.filter(i => i.id !== itemId);
    const packedCount = updatedItems.filter(i => i.checked).length;
    const totalCount = updatedItems.length;
    const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

    const updatedData: PackingAssistantData = {
      ...data,
      items: updatedItems,
      packedCount,
      totalCount,
      progressPercent,
      lastUpdated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedData));
    return updatedData;
  } catch {
    return null;
  }
};

/**
 * Resetuje listę pakowania i generuje ją od nowa na podstawie parametrów podróży
 */
export const resetPackingList = async (params: PackingListParams): Promise<PackingAssistantData> => {
  const tripId = params.tripId || 'default-trip';
  const storageKey = `${STORAGE_PREFIX}${tripId}`;
  await AsyncStorage.removeItem(storageKey);
  return loadPackingAssistant(params);
};

/**
 * Formatuje czysty tekst checklisty do udostępnienia (np. WhatsApp, Notes, e-mail)
 */
export const formatPackingListForSharing = (
  data: PackingAssistantData,
  language: 'pl' | 'en' = 'pl'
): string => {
  const t = translations[language]?.smartPacking || translations.pl.smartPacking;
  const title = (t.shareTitle || 'DESTIVO - LISTA PAKOWANIA: {{destination}}').replace('{{destination}}', data.destination.toUpperCase());
  const header = (t.shareHeader || 'Czas trwania: {{days}} dni | Transport: {{transport}} | Pogoda: {{temp}}°C, {{condition}}\nPostęp: {{packed}}/{{total}} ({{percent}}%)\n')
    .replace('{{days}}', String(data.durationDays))
    .replace('{{transport}}', data.transportType)
    .replace('{{temp}}', String(data.weather.temp))
    .replace('{{condition}}', data.weather.condition)
    .replace('{{packed}}', String(data.packedCount))
    .replace('{{total}}', String(data.totalCount))
    .replace('{{percent}}', String(data.progressPercent));

  const lines = [title, '----------------------------------------', header];

  const categories: PackingCategory[] = ['transport', 'weather', 'clothing', 'toiletries', 'electronics', 'documents', 'custom'];
  const categoryNames: Record<PackingCategory, string> = {
    transport: t.shareCatTransport || t.catTransport,
    weather: t.shareCatWeather || t.catWeather,
    clothing: t.shareCatClothing || t.catClothing,
    toiletries: t.shareCatToiletries || t.catToiletries,
    electronics: t.shareCatElectronics || t.catElectronics,
    documents: t.shareCatDocuments || t.catDocuments,
    custom: t.shareCatCustom || t.catCustom,
  };

  for (const cat of categories) {
    const catItems = data.items.filter(i => i.category === cat);
    if (catItems.length > 0) {
      lines.push(`\n${categoryNames[cat]}:`);
      for (const item of catItems) {
        const checkMark = item.checked ? '[x]' : '[ ]';
        const qty = item.quantity ? ` (${item.quantity} ${item.unit || ''})` : '';
        lines.push(`${checkMark} ${item.title}${qty}`);
      }
    }
  }

  lines.push('\n----------------------------------------');
  lines.push(t.shareFooter || 'Wygenerowano automatycznie w aplikacji Destivo');
  return lines.join('\n');
};
