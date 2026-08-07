import { TransportOption, TransportType } from '../store/tripCreatorStore';

/**
 * Zasada tego modułu:
 * - NIE generujemy fikcyjnych cen na podstawie dystansu.
 * - NIE rozszerzamy ceny live przez arbitralne mnożniki 0.75 / 1.35.
 * - każda cena ma status i źródło.
 * - jeśli nie mamy wiarygodnej ceny, oznaczamy ją jako UNAVAILABLE/ESTIMATE
 *   zamiast udawać, że znamy cenę.
 *
 * GTFS/GTFS-Realtime nadaje się do rozkładów i danych realtime transportu,
 * ale cena musi pochodzić z taryfy/operatora, jeśli ma być przedstawiona
 * jako aktualna cena zakupu.
 */

export type PriceStatus = 'LIVE' | 'ESTIMATE' | 'UNAVAILABLE';
export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface UserTravelContext {
  accessDurationMinutes?: number;
  egressDurationMinutes?: number;
  hasCheckedBag?: boolean;
  hasCabinBag?: boolean;
  carFuelConsumption?: number;
  fuelPricePerLiter?: number;
  tollsAndFees?: number;
  parkingCost?: number;
  departureAt?: string;
}

export interface RoutePrice {
  min: number;
  max: number;
  currency: string;
  status: PriceStatus;
  source: string;
  checkedAt?: string;
  /**
   * true tylko wtedy, gdy cena może być traktowana jako cena
   * możliwa do zakupu dla wskazanej daty/trasy.
   */
  purchasable?: boolean;
}

export interface TransportRouteMetadata {
  price: RoutePrice;
  distanceKm: number;
  rawDurationMinutes: number;
  doorToDoorDurationMinutes: number;
  dataConfidence: DataConfidence;
  notes?: string[];
}

interface RawRouteInput {
  type: TransportType;
  provider: string;
  distanceKm: number;
  rawDurationMinutes: number;
  bookingUrl?: string;

  /**
   * Cena jest jawnie opisana jako LIVE / ESTIMATE / UNAVAILABLE.
   * Dla UNAVAILABLE nie podajemy sztucznej ceny.
   */
  price: RoutePrice;

  /**
   * Opcjonalne dodatkowe koszty już policzone przez źródło.
   * Np. transfer lotniskowy, bagaż albo opłaty przewoźnika.
   */
  extraCost?: number;

  dataConfidence?: DataConfidence;
  notes?: string[];
}

interface GeoCoords {
  lat: number;
  lon: number;
}

export interface TransportDataProvider {
  /**
   * Dostawca może zwrócić wyłącznie dane, które faktycznie zna.
   * Brak danych = null, a nie wygenerowana cena.
   */
  getRoutes(args: {
    origin: string;
    destination: string;
    departureAt?: string;
    context?: UserTravelContext;
  }): Promise<RawRouteInput[]>;
}

/**
 * Metadane są trzymane osobno, żeby ten plik był kompatybilny
 * z obecnym TransportOption. W kolejnym kroku warto dodać te pola
 * bezpośrednio do tripCreatorStore.
 */
const routeMetadata = new Map<string, TransportRouteMetadata>();

export function getTransportRouteMetadata(id: string): TransportRouteMetadata | undefined {
  return routeMetadata.get(id);
}

export function clearTransportRouteMetadata(): void {
  routeMetadata.clear();
}

/**
 * Geokodowanie jest celowo wydzielone.
 *
 * Publiczny Nominatim ma ograniczenia użycia i nie powinien być traktowany
 * jako bezlimitowy backend produkcyjny. Dla produkcji podmień tę funkcję
 * na własnego dostawcę / własną instancję i dodaj cache.
 */
async function getCoordinates(placeName: string): Promise<GeoCoords | null> {
  if (!placeName?.trim()) return null;

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&` +
      `q=${encodeURIComponent(placeName.trim())}&limit=1`;

    const res = await fetch(url, {
      headers: {
        // W produkcji ustaw prawidłowy identyfikator aplikacji i Referer
        // zgodnie z polityką używanego dostawcy geokodowania.
        'User-Agent': 'DestivoApp/1.0 (contact: developer@example.com)',
      },
    });

    if (!res.ok) {
      console.warn('Geocoding HTTP error:', res.status);
      return null;
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) return null;

    const lat = Number(data[0]?.lat);
    const lon = Number(data[0]?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lon };
  } catch (error) {
    console.warn('Błąd geokodowania:', error);
    return null;
  }
}

/**
 * Dystans geograficzny. To NIE jest dystans drogowy.
 * Używamy go tylko jako fallback / do identyfikacji trasy.
 * Dla samochodu produkcyjnie należy użyć routing API.
 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Zaokrąglenie wyłącznie prezentacyjne.
 * Nie służy do tworzenia "ładnych" widełek cenowych.
 */
function roundMoney(value: number, step = 1): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function getDefaultTerminalBuffer(type: TransportType): number {
  const values: Record<TransportType, number> = {
    flight: 90,
    train: 15,
    bus: 15,
    car: 0,
  };

  return values[type];
}

function getDefaultAccessTime(type: TransportType): number {
  const values: Record<TransportType, number> = {
    flight: 45,
    train: 15,
    bus: 20,
    car: 0,
  };

  return values[type];
}

function getDefaultEgressTime(type: TransportType): number {
  const values: Record<TransportType, number> = {
    flight: 35,
    train: 15,
    bus: 15,
    car: 0,
  };

  return values[type];
}

/**
 * Oblicza Door-to-Door bez wymyślania ceny.
 *
 * rawDurationMinutes musi pochodzić z rzeczywistego rozkładu/routingu.
 */
export function calculateSmartMetrics(
  raw: RawRouteInput,
  context: UserTravelContext = {}
): TransportOption {
  const accessTime =
    context.accessDurationMinutes ?? getDefaultAccessTime(raw.type);
  const egressTime =
    context.egressDurationMinutes ?? getDefaultEgressTime(raw.type);
  const terminalTime = getDefaultTerminalBuffer(raw.type);

  const d2dMinutes =
    raw.rawDurationMinutes + accessTime + egressTime + terminalTime;

  let totalCost = 0;
  let minCost = 0;
  let maxCost = 0;

  const badges: TransportOption['badges'] = [];

  if (raw.price.status === 'UNAVAILABLE') {
    // WAŻNE: nie ustawiamy ceny zastępczej.
    // Obecny TransportOption wymaga liczby, więc 0 jest wartością techniczną.
    // UI powinien użyć getTransportRouteMetadata(id) i wyświetlić
    // "Brak aktualnej ceny", a nie "0 zł".
    totalCost = 0;
    minCost = 0;
    maxCost = 0;
  } else {
    const extraCost = raw.extraCost ?? 0;

    minCost = roundMoney(raw.price.min + extraCost);
    maxCost = roundMoney(raw.price.max + extraCost);

    // Dla LIVE min == max oznacza konkretną aktualnie zwróconą cenę.
    // Dla ESTIMATE zachowujemy zakres dostarczony przez źródło.
    totalCost =
      raw.price.min === raw.price.max
        ? roundMoney(raw.price.min + extraCost)
        : roundMoney((raw.price.min + raw.price.max) / 2 + extraCost);
  }

  const stressScore = calculateStressScore(raw, d2dMinutes);
  const dataConfidence = raw.dataConfidence ?? confidenceFromPrice(raw.price);

  if (raw.price.status === 'LIVE' && raw.price.purchasable !== false) {
    badges.push('LIVE_DATA');
  }

  if (raw.price.status === 'ESTIMATE') {
    badges.push('ESTIMATED');
  }

  if (raw.price.status === 'UNAVAILABLE') {
    badges.push('NO_PRICE_DATA');
  }

  if (raw.type === 'train') {
    badges.push('HIGH_COMFORT');
  }

  const id = `${raw.type}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  routeMetadata.set(id, {
    price: {
      ...raw.price,
      min: minCost,
      max: maxCost,
    },
    distanceKm: raw.distanceKm,
    rawDurationMinutes: raw.rawDurationMinutes,
    doorToDoorDurationMinutes: d2dMinutes,
    dataConfidence,
    notes: raw.notes,
  });

  return {
    id,
    type: raw.type,
    provider: raw.provider,
    rawDurationMinutes: raw.rawDurationMinutes,
    doorToDoorDurationMinutes: d2dMinutes,
    basePrice: raw.price.status === 'UNAVAILABLE' ? 0 : roundMoney(raw.price.min),
    totalCost,
    minTotalCost: minCost,
    maxTotalCost: maxCost,
    price: {
      ...raw.price,
      min: minCost,
      max: maxCost,
    },
    dataConfidence,
    distanceKm: raw.distanceKm,
    stressScore,
    bookingUrl: raw.bookingUrl,
    badges,
  };
}

function confidenceFromPrice(price: RoutePrice): DataConfidence {
  if (price.status === 'LIVE' && price.purchasable !== false) return 'HIGH';
  if (price.status === 'ESTIMATE') return 'MEDIUM';
  return 'LOW';
}

function calculateStressScore(
  raw: RawRouteInput,
  d2dMinutes: number
): number {
  const base: Record<TransportType, number> = {
    flight: 7,
    train: 2,
    bus: 5,
    car: 7,
  };

  let score = base[raw.type];

  if (d2dMinutes > 18 * 60) score += 1;
  if (raw.type === 'car' && raw.distanceKm > 1000) score += 1;

  return Math.max(1, Math.min(10, score));
}

/**
 * Porównanie bierze pod uwagę tylko dane, które mają cenę.
 *
 * To eliminuje błąd z poprzedniej wersji:
 * brak ceny nie może automatycznie oznaczać "0 zł" i wygrywać
 * kategorii CHEAPEST_TOTAL.
 */
export function enrichWithComparisonBadges(
  options: TransportOption[]
): TransportOption[] {
  if (!options.length) return [];

  const pricedOptions = options.filter((option) => {
    const meta = routeMetadata.get(option.id);
    return meta?.price.status !== 'UNAVAILABLE';
  });

  const minTime = Math.min(
    ...options.map((o) => o.doorToDoorDurationMinutes)
  );

  const minCost =
    pricedOptions.length > 0
      ? Math.min(...pricedOptions.map((o) => o.minTotalCost))
      : Number.POSITIVE_INFINITY;

  const getSmartScore = (opt: TransportOption) => {
    const meta = routeMetadata.get(opt.id);
    const hasPrice = meta?.price.status !== 'UNAVAILABLE';

    // Brak ceny = nie rekomendujemy jako "Smart Choice".
    if (!hasPrice) return Number.POSITIVE_INFINITY;

    // Koszt + czas + stres.
    // Jednostki są celowo proste; później warto przenieść wagi
    // do konfiguracji użytkownika.
    return opt.totalCost + opt.doorToDoorDurationMinutes * 0.8 + opt.stressScore * 12;
  };

  const bestSmartOption =
    pricedOptions.length > 0
      ? [...pricedOptions].sort(
          (a, b) => getSmartScore(a) - getSmartScore(b)
        )[0]
      : undefined;

  return options.map((opt) => {
    const updatedBadges = [...opt.badges];

    if (
      opt.doorToDoorDurationMinutes === minTime &&
      !updatedBadges.includes('FASTEST_D2D')
    ) {
      updatedBadges.push('FASTEST_D2D');
    }

    if (
      opt.minTotalCost === minCost &&
      minCost !== Number.POSITIVE_INFINITY &&
      !updatedBadges.includes('CHEAPEST_TOTAL')
    ) {
      updatedBadges.push('CHEAPEST_TOTAL');
    }

    if (
      bestSmartOption &&
      opt.id === bestSmartOption.id &&
      !updatedBadges.includes('SMART_CHOICE')
    ) {
      updatedBadges.push('SMART_CHOICE');
    }

    return {
      ...opt,
      badges: updatedBadges,
    };
  });
}

/**
 * Samochód może być policzony lokalnie, bo nie jest to cena biletu.
 *
 * Uwaga:
 * distanceKm powinno pochodzić z routing API, a nie z Haversine.
 */
export function buildCarRouteFromRoutingData(args: {
  distanceKm: number;
  durationMinutes: number;
  provider?: string;
  tollsAndFees?: number;
  parkingCost?: number;
  context?: UserTravelContext;
}): RawRouteInput {
  const consumption = args.context?.carFuelConsumption ?? 7.0;
  const fuelPrice = args.context?.fuelPricePerLiter ?? 6.60;

  const fuelCost =
    (args.distanceKm / 100) * consumption * fuelPrice;

  const tolls = args.tollsAndFees ?? args.context?.tollsAndFees ?? 0;
  const parking = args.parkingCost ?? args.context?.parkingCost ?? 0;

  const total = roundMoney(fuelCost + tolls + parking);

  return {
    type: 'car',
    provider: args.provider ?? 'Routing + kalkulator kosztów',
    distanceKm: args.distanceKm,
    rawDurationMinutes: args.durationMinutes,
    price: {
      min: total,
      max: total,
      currency: 'PLN',
      status: 'ESTIMATE',
      source: 'ROUTING_AND_USER_INPUT',
      checkedAt: new Date().toISOString(),
      purchasable: false,
    },
    dataConfidence: 'MEDIUM',
    notes: [
      `Paliwo: ${roundMoney(fuelCost)} zł`,
      `Opłaty: ${roundMoney(tolls)} zł`,
      `Parking: ${roundMoney(parking)} zł`,
      `Spalanie: ${consumption} l/100 km`,
      `Cena paliwa: ${fuelPrice.toFixed(2)} zł/l`,
    ],
  };
}

/**
 * Ta funkcja zastępuje wcześniejszy generateUniversalRoutes().
 *
 * NIE tworzy już:
 *   trainPrice = ...
 *   busPrice = ...
 *   flightPrice = ...
 *
 * Zamiast tego oczekuje danych z prawdziwego providera.
 */
export async function fetchTransportComparisons(
  destination: string,
  origin: string,
  provider: TransportDataProvider,
  context: UserTravelContext = {}
): Promise<TransportOption[]> {
  if (!origin?.trim() || !destination?.trim()) return [];

  clearTransportRouteMetadata();

  const rawRoutes = await provider.getRoutes({
    origin: origin.trim(),
    destination: destination.trim(),
    departureAt: context.departureAt,
    context,
  });

  const calculated = rawRoutes.map((item) =>
    calculateSmartMetrics(item, context)
  );

  return enrichWithComparisonBadges(calculated);
}

/**
 * Pomocniczy fallback do geokodowania/routingu prototypowego.
 *
 * NIE generuje cen pociągu/autobusu/lotu.
 * Może służyć jedynie do uzyskania orientacyjnej geometrii dla samochodu,
 * jeśli masz osobny routing provider.
 */
export async function getAirDistanceForDiagnostics(
  origin: string,
  destination: string
): Promise<number | null> {
  const [start, end] = await Promise.all([
    getCoordinates(origin),
    getCoordinates(destination),
  ]);

  if (!start || !end) return null;

  return calculateDistanceKm(
    start.lat,
    start.lon,
    end.lat,
    end.lon
  );
}