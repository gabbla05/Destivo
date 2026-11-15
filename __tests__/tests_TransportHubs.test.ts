/// <reference types="jest" />
jest.mock('../src/lib/config', () => ({ getGoogleApiKey: () => 'test-key' }));
jest.mock('../src/lib/geoDatabase', () => ({
  resolveCoordinates: jest.fn(async () => ({ lat: 50.06, lon: 19.94 })),
  calculateDistanceKm: (a: number, b: number, c: number, d: number) => Math.hypot(a - c, b - d) * 100,
}));

import { findNearbyHubs, hubKindsForTransport, __resetTransportHubsCache } from '../src/lib/transportHubs';

const place = (id: string, name: string, lat: number, lon: number, ratings = 0) => ({
  place_id: id, name, vicinity: `${name} street`, user_ratings_total: ratings, geometry: { location: { lat, lng: lon } },
});

describe('transportHubs — stacje w pobliżu do wyboru z listy', () => {
  const originalFetch = global.fetch;
  beforeEach(() => __resetTransportHubsCache());
  afterAll(() => { global.fetch = originalFetch; });

  test('rodzaj miejsc zależy od transportu; samochód nie ma listy', () => {
    expect(hubKindsForTransport('flight')).toEqual(['airport']);
    expect(hubKindsForTransport('train')).toEqual(['train_station']);
    expect(hubKindsForTransport('bus')).toEqual(['bus_station']);
    expect(hubKindsForTransport('car')).toEqual([]);
  });

  test('dworce sortowane od najbliższego, bez duplikatów nazw', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ results: [
        place('b', 'Kraków Płaszów', 50.03, 19.97),
        place('a', 'Kraków Główny', 50.067, 19.947),
        place('c', 'Kraków Główny', 50.067, 19.947),
      ] }) } as any;
    }) as any;
    const hubs = await findNearbyHubs('Kraków', 'train');
    expect(urls[0]).toContain('type=train_station');
    expect(hubs.map((h) => h.name)).toEqual(['Kraków Główny', 'Kraków Płaszów']);
    expect(hubs[0].distanceKm).toBeLessThan(hubs[1].distanceKm);
  });

  test('lotniska sortowane po popularności (duży port, nie lądowisko)', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [
      place('x', 'Lądowisko Pobiednik', 50.09, 20.2, 40),
      place('y', 'Kraków Airport (KRK)', 50.077, 19.785, 25000),
    ] }) })) as any;
    const hubs = await findNearbyHubs('Kraków', 'flight');
    expect(hubs[0].name).toBe('Kraków Airport (KRK)');
    expect(hubs[0].kind).toBe('airport');
  });

  test('bez internetu lista jest pusta, a nie błąd', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as any;
    await expect(findNearbyHubs('Kraków', 'train')).resolves.toEqual([]);
  });
});
