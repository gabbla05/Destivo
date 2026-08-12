import { TransportOption, TransportType } from '../store/tripCreatorStore';

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type TransportBadge = 'SMART_CHOICE' | 'HIGH_COMFORT';

export interface TransportRouteMetadata {
  distanceKm: number;
  notes?: string[];
  actionLinks?: { label: string; url: string }[];
}

interface RawRouteInput {
  type: TransportType;
  provider: string;
  bookingUrl?: string;
  notes?: string[];
  actionLinks?: { label: string; url: string }[];
}

const routeMetadata = new Map<string, TransportRouteMetadata>();

export function getTransportRouteMetadata(id: string): TransportRouteMetadata | undefined {
  return routeMetadata.get(id);
}

export function clearTransportRouteMetadata(): void {
  routeMetadata.clear();
}

export interface TransportDataProvider {
  getRoutes(args: {
    origin: string;
    destination: string;
    departureAt?: string;
  }): Promise<RawRouteInput[]>;
}

export function calculateSmartMetrics(raw: RawRouteInput): TransportOption {
  const id = `${raw.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  routeMetadata.set(id, {
    distanceKm: 0,
    notes: raw.notes,
    actionLinks: raw.actionLinks,
  });

  return {
    id,
    type: raw.type,
    provider: raw.provider,
    rawDurationMinutes: 0,
    doorToDoorDurationMinutes: 0,
    basePrice: 0,
    totalCost: 0,
    minTotalCost: 0,
    maxTotalCost: 0,
    price: {
      min: 0,
      max: 0,
      currency: 'PLN',
      status: 'UNAVAILABLE',
      source: '',
      purchasable: false,
    },
    dataConfidence: 'MEDIUM',
    distanceKm: 0,
    stressScore: 3,
    bookingUrl: raw.bookingUrl,
    actionLinks: raw.actionLinks,
    badges: ['SMART_CHOICE'],
  };
}

export async function fetchTransportComparisons(
  destination: string,
  origin: string,
  provider: TransportDataProvider,
  context: any = {}
): Promise<TransportOption[]> {
  if (!origin?.trim() || !destination?.trim()) return [];
  clearTransportRouteMetadata();
  
  const rawRoutes = await provider.getRoutes({
    origin: origin.trim(),
    destination: destination.trim(),
    departureAt: context.departureAt,
  });

  return rawRoutes.map((item) => calculateSmartMetrics(item));
}