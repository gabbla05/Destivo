import { create } from 'zustand';

export interface AttractionItem {
  id: string;
  name: string;
  price?: number;
  category?: string;
}

export interface TripCreatorState {
  // Krok 1: Cel i daty (Jedyny wymagany krok)
  tripName: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;

  // Krok 2: Transport (opcjonalny)
  transportType: 'cheapest' | 'fastest' | 'custom' | null;
  customTransport: string;

  // Krok 3: Nocleg (opcjonalny)
  lodgingAddress: string;

  // Krok 4: Atrakcje w promieniu (opcjonalny)
  radiusKm: number;
  selectedAttractions: AttractionItem[];

  // Akcje - Settery
  setStep1Data: (data: { tripName?: string; origin?: string; destination: string; startDate?: string; endDate?: string }) => void;
  setTransport: (type: 'cheapest' | 'fastest' | 'custom' | null, customTransport?: string) => void;
  setLodgingAddress: (address: string) => void;
  setRadiusKm: (radius: number) => void;
  toggleAttraction: (item: AttractionItem) => void;
  resetForm: () => void;
}

const initialState = {
  tripName: '',
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',
  transportType: null,
  customTransport: '',
  lodgingAddress: '',
  radiusKm: 5,
  selectedAttractions: [],
};

export const useTripCreatorStore = create<TripCreatorState>((set) => ({
  ...initialState,

  setStep1Data: (data) =>
    set((state) => ({
      tripName: data.tripName ?? state.tripName,
      origin: data.origin ?? state.origin,
      destination: data.destination,
      startDate: data.startDate ?? state.startDate,
      endDate: data.endDate ?? state.endDate,
    })),

  setTransport: (type, customTransport = '') =>
    set({ transportType: type, customTransport }),

  setLodgingAddress: (address) =>
    set({ lodgingAddress: address }),

  setRadiusKm: (radius) =>
    set({ radiusKm: radius }),

  toggleAttraction: (item) =>
    set((state) => {
      const exists = state.selectedAttractions.some((a) => a.id === item.id);
      return {
        selectedAttractions: exists
          ? state.selectedAttractions.filter((a) => a.id !== item.id)
          : [...state.selectedAttractions, item],
      };
    }),

  resetForm: () => set(initialState),
}));