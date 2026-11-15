/// <reference types="jest" />
// P14: opcja transportu to rekomendacja z linkami - bez stałych, udawanych metryk.
import { calculateSmartMetrics, getTransportRouteMetadata } from '../src/lib/transportCalculator';

test('opcja transportu nie zawiera stałych ocen (badges, stressScore, dataConfidence)', () => {
  const option: any = calculateSmartMetrics({
    type: 'train',
    provider: 'PKP Intercity / Koleo',
    bookingUrl: 'https://koleo.pl',
    notes: ['Rekomendowane połączenie kolejowe (~252 km). Sprawdź bilety na Koleo.'],
  });
  expect(option.badges).toBeUndefined();
  expect(option.stressScore).toBeUndefined();
  expect(option.dataConfidence).toBeUndefined();
  expect(option.distanceKm).toBe(252);
  expect(option.price.status).toBe('UNAVAILABLE');
  expect(getTransportRouteMetadata(option.id)?.distanceKm).toBe(252);
});
