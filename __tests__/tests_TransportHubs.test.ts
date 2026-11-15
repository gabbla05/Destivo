/// <reference types="jest" />
jest.mock('../src/lib/config', () => ({ getGoogleApiKey: () => 'test-key' }));
jest.mock('../src/lib/geoDatabase', () => ({
  resolveCoordinates: jest.fn(async () => ({ lat: 50.06, lon: 19.94 })),
  calculateDistanceKm: (a: number, b: number, c: number, d: number) => Math.hypot(a - c, b - d) * 100,
}));

import { findNearbyHubs, hubKindsForTransport, isRealHub, __resetTransportHubsCache } from '../src/lib/transportHubs';

const place = (id: string, name: string, lat: number, lon: number, types: string[], ratings = 0) => ({
  place_id: id, name, vicinity: `${name} street`, types, user_ratings_total: ratings, geometry: { location: { lat, lng: lon } },
});
const respond = (results: any[]) => jest.fn(async () => ({ ok: true, json: async () => ({ results }) })) as any;

describe('transportHubs — tylko lotniska i dworce kolejowe do wyboru z listy', () => {
  const originalFetch = global.fetch;
  beforeEach(() => __resetTransportHubsCache());
  afterAll(() => { global.fetch = originalFetch; });

  test('rodzaj miejsc zależy od transportu; samochód i bus nie mają listy', () => {
    expect(hubKindsForTransport('flight')).toEqual(['airport']);
    expect(hubKindsForTransport('train')).toEqual(['train_station']);
    expect(hubKindsForTransport('car')).toEqual([]);
    expect(hubKindsForTransport('bus')).toEqual([]);
  });

  test('przy lotnisku zostają tylko porty lotnicze — bez parkingów, wypożyczalni i lądowisk', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ results: [
        place('p1', 'Green Parking Balice', 50.08, 19.79, ['parking', 'point_of_interest'], 2400),
        place('p2', 'Airport Parking Kraków', 50.07, 19.8, ['airport', 'point_of_interest'], 900),
        place('r1', 'Panek Rent a Car Lotnisko', 50.07, 19.79, ['car_rental', 'airport'], 300),
        place('l1', 'Lądowisko Pobiednik Wielki', 50.09, 20.2, ['airport'], 40),
        place('k', 'Kraków Airport im. Jana Pawła II (KRK)', 50.077, 19.785, ['airport', 'point_of_interest'], 25000),
        place('w', 'Katowice Airport (KTW)', 50.47, 19.08, ['airport'], 15000),
      ] }) } as any;
    }) as any;
    const hubs = await findNearbyHubs('Kraków', 'flight');
    expect(urls[0]).toContain('type=airport');
    expect(hubs.map((h) => h.name)).toEqual(['Kraków Airport im. Jana Pawła II (KRK)', 'Katowice Airport (KTW)']);
    expect(hubs[0].kind).toBe('airport');
  });

  test('dworce kolejowe: główny na górze, bez parkingów, przystanków tramwajowych i duplikatów', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ results: [
        place('b', 'Kraków Płaszów', 50.03, 19.97, ['train_station', 'transit_station'], 4000),
        place('x', 'Parking P+R Dworzec Główny', 50.066, 19.946, ['parking', 'train_station'], 800),
        place('t', 'Rondo Mogilskie', 50.065, 19.959, ['transit_station'], 900),
        place('a', 'Kraków Główny', 50.067, 19.947, ['train_station', 'transit_station'], 30000),
        place('c', 'Kraków Główny Train Station', 50.0671, 19.9471, ['train_station'], 500),
      ] }) } as any;
    }) as any;
    const hubs = await findNearbyHubs('Kraków', 'train');
    expect(urls[0]).toContain('language=pl');
    expect(hubs.map((h) => h.name)).toEqual(['Kraków Główny', 'Kraków Płaszów']);
  });

  test('isRealHub rozpoznaje lotniska po nazwie w różnych językach', () => {
    const airport = (name: string) => ({ name, types: ['airport'], user_ratings_total: 5000 });
    expect(isRealHub(airport('Warsaw Chopin Airport'), 'airport')).toBe(true);
    expect(isRealHub(airport('Lotnisko Chopina w Warszawie'), 'airport')).toBe(true);
    expect(isRealHub(airport('Aeropuerto de Barcelona-El Prat'), 'airport')).toBe(true);
    expect(isRealHub(airport('Flughafen Wien'), 'airport')).toBe(true);
    expect(isRealHub(airport('Hotel przy lotnisku'), 'airport')).toBe(false);
    expect(isRealHub(airport('Taxi Airport Transfer'), 'airport')).toBe(false);
  });

  test('bez internetu lista jest pusta, a nie błąd', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as any;
    await expect(findNearbyHubs('Kraków', 'train')).resolves.toEqual([]);
  });
});
