import { create } from 'zustand';

export type TransportType = 'flight' | 'train' | 'bus' | 'car';

/**
 * Status ceny:
 * LIVE        = aktualna cena zwrócona przez wiarygodne źródło,
 * ESTIMATE    = koszt obliczony / orientacyjny,
 * UNAVAILABLE = brak wiarygodnej ceny.
 */
export type PriceStatus = 'LIVE' | 'ESTIMATE' | 'UNAVAILABLE';

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type TransportBadge =
  | 'SMART_CHOICE'
  | 'FASTEST_D2D'
  | 'CHEAPEST_TOTAL'
  | 'HIGH_COMFORT'
  | 'LIVE_DATA'
  | 'ESTIMATED'
  | 'NO_PRICE_DATA';

export interface TransportPrice {
  min: number;
  max: number;
  currency: string;
  status: PriceStatus;
  source: string;
  checkedAt?: string;
  /**
   * true tylko dla ceny, którą można traktować jako cenę
   * możliwą do zakupu dla konkretnej trasy/dat.
   */
  purchasable?: boolean;
}

export interface TransportOption {
  id: string;
  type: TransportType;
  provider: string;

  /**
   * Czas samego przejazdu / lotu z rozkładu albo routingu.
   */
  rawDurationMinutes: number;

  /**
   * Szacowany rzeczywisty czas Door-to-Door.
   * Dla lotu może zawierać dojazd + odprawę + transfer.
   */
  doorToDoorDurationMinutes: number;

  /**
   * Zachowane dla kompatybilności z istniejącym UI/budżetem.
   *
   * Dla LIVE:
   *   konkretna cena źródłowa.
   *
   * Dla ESTIMATE:
   *   dolna granica estymacji.
   *
   * Dla UNAVAILABLE:
   *   0 jest wyłącznie wartością techniczną.
   *   UI MUSI sprawdzić price.status i nie wyświetlać "0 zł".
   */
  basePrice: number;

  /**
   * Wartość używana do budżetu i sortowania:
   * - LIVE: konkretna cena,
   * - ESTIMATE: środek zakresu,
   * - UNAVAILABLE: 0 technicznie; nie może być używany jako koszt
   *   bez sprawdzenia price.status.
   */
  totalCost: number;

  /**
   * Zakres rzeczywistej/estymowanej ceny.
   */
  minTotalCost: number;
  maxTotalCost: number;

  /**
   * Pełne informacje o cenie i jej wiarygodności.
   */
  price: TransportPrice;

  /**
   * Ogólny poziom zaufania do danych trasy.
   */
  dataConfidence: DataConfidence;

  /**
   * Odległość wykorzystana do obliczenia trasy/kosztu.
   * Dla samochodu powinna pochodzić z routingu drogowego.
   */
  distanceKm: number;

  stressScore: number;

  bookingUrl?: string;

  /**
   * Dodatkowe informacje, np.:
   * - składniki kosztu paliwa,
   * - opłaty drogowe,
   * - ograniczenia taryfy,
   * - ostrzeżenia o estymacji.
   */
  notes?: string[];

  badges: TransportBadge[];
}

export interface TripCreatorState {
  tripName: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;

  transport: {
    selectedOption: TransportOption | null;

    /**
     * Koszt wpisany do budżetu.
     *
     * undefined oznacza brak wiarygodnej ceny.
     * Dzięki temu transport bez ceny nie zostanie policzony jako 0 zł.
     */
    customCost?: number;

    /**
     * Waluta kosztu transportu.
     */
    currency: string;

    /**
     * Status ceny wybranej opcji.
     */
    priceStatus: PriceStatus | null;

    /**
     * Źródło ceny wybranej opcji.
     */
    priceSource?: string;

    /**
     * Moment ostatniego sprawdzenia ceny.
     */
    priceCheckedAt?: string;
  };

  lodging: {
    type: string | null;
    cost: number;
  };

  attractions: {
    selected: string[];
    budget: number;
  };

  setTripName: (tripName: string) => void;
  setOrigin: (origin: string) => void;
  setDestination: (destination: string) => void;

  setStep1Data: (data: {
    tripName: string;
    origin: string;
    destination: string;
    startDate: string;
    endDate: string;
  }) => void;

  setTransportOption: (option: TransportOption) => void;
  setCustomTransportCost: (cost: number) => void;
  clearCustomTransportCost: () => void;

  setLodging: (lodging: {
    type: string | null;
    cost: number;
  }) => void;

  setAttractions: (attractions: {
    selected: string[];
    budget: number;
  }) => void;

  reset: () => void;
}

const initialState: Omit<
  TripCreatorState,
  | 'setTripName'
  | 'setOrigin'
  | 'setDestination'
  | 'setStep1Data'
  | 'setTransportOption'
  | 'setCustomTransportCost'
  | 'clearCustomTransportCost'
  | 'setLodging'
  | 'setAttractions'
  | 'reset'
> = {
  tripName: '',
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',

  transport: {
    selectedOption: null,
    customCost: undefined,
    currency: 'PLN',
    priceStatus: null,
    priceSource: undefined,
    priceCheckedAt: undefined,
  },

  lodging: {
    type: null,
    cost: 0,
  },

  attractions: {
    selected: [],
    budget: 0,
  },
};

export const useTripCreatorStore = create<TripCreatorState>((set) => ({
  ...initialState,

  setTripName: (tripName) =>
    set({ tripName }),

  setOrigin: (origin) =>
    set({ origin }),

  setDestination: (destination) =>
    set({ destination }),

  setStep1Data: (data) =>
    set({
      tripName: data.tripName,
      origin: data.origin,
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
    }),

  setTransportOption: (option) =>
    set((state) => {
      const isPriceAvailable =
        option.price.status !== 'UNAVAILABLE';

      return {
        transport: {
          ...state.transport,

          selectedOption: option,

          /**
           * Najważniejsza zmiana:
           * brak aktualnej ceny NIE staje się 0 zł w budżecie.
           */
          customCost: isPriceAvailable
            ? option.totalCost
            : undefined,

          currency: option.price.currency,

          priceStatus: option.price.status,

          priceSource: option.price.source,

          priceCheckedAt: option.price.checkedAt,
        },
      };
    }),

  setCustomTransportCost: (cost) =>
    set((state) => ({
      transport: {
        ...state.transport,
        customCost: Number.isFinite(cost)
          ? Math.max(0, cost)
          : undefined,
      },
    })),

  clearCustomTransportCost: () =>
    set((state) => ({
      transport: {
        ...state.transport,
        customCost: undefined,
      },
    })),

  setLodging: (lodging) =>
    set({ lodging }),

  setAttractions: (attractions) =>
    set({ attractions }),

  reset: () =>
    set(initialState),
}));