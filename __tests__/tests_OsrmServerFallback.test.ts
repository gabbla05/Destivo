/**
 * Optymalizacja trasy ma działać w każdej sieci: serwer OSRM w sieci lokalnej (np. 192.168.x.x
 * dla Krakowa) jest dostępny tylko w domowym Wi-Fi, więc po jego błędzie aplikacja musi
 * odpytać serwer publiczny.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { osrmKrakowBaseUrl: 'http://192.168.31.15:5000' } } },
}));

import { fetchOsrmRoadMatrix, OSRM_MATRIX_CACHE, clearInFlightOsrmRequests } from '../src/lib/routeOptimization';
import { getOsrmBaseUrlCandidates, isPrivateNetworkUrl, DEFAULT_OSRM_ROUTER_URL } from '../src/lib/config';

const krakowPoints = [
  { id: 'a', title: 'Wawel', lat: 50.054, lon: 19.935 },
  { id: 'b', title: 'Rynek', lat: 50.0617, lon: 19.9373 },
  { id: 'c', title: 'Kazimierz', lat: 50.0513, lon: 19.9447 },
];

const okResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    code: 'Ok',
    durations: [
      [0, 300, 400],
      [300, 0, 350],
      [400, 350, 0],
    ],
    distances: [
      [0, 1200, 1500],
      [1200, 0, 1300],
      [1500, 1300, 0],
    ],
  }),
};

describe('OSRM: serwer lokalny -> serwer publiczny', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    OSRM_MATRIX_CACHE.clear();
    clearInFlightOsrmRequests();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('lista serwerów zaczyna się od lokalnego, a kończy publicznym', () => {
    const list = getOsrmBaseUrlCandidates('driving', krakowPoints);
    expect(list[0]).toBe('http://192.168.31.15:5000');
    expect(list).toContain(DEFAULT_OSRM_ROUTER_URL);
    expect(isPrivateNetworkUrl(list[0])).toBe(true);
    expect(isPrivateNetworkUrl(DEFAULT_OSRM_ROUTER_URL)).toBe(false);
  });

  test('poza domowym Wi-Fi (lokalny serwer nie odpowiada) macierz pochodzi z serwera publicznego', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      calls.push(String(url));
      if (String(url).startsWith('http://192.168.')) throw new TypeError('Network request failed');
      return okResponse as any;
    }) as any;

    const result = await fetchOsrmRoadMatrix(krakowPoints, { criterion: 'duration', profile: 'driving' });
    expect(result.matrix[0][1]).toBe(300);
    expect(calls[0].startsWith('http://192.168.31.15:5000/table/v1/driving/')).toBe(true);
    expect(calls[calls.length - 1].startsWith(`${DEFAULT_OSRM_ROUTER_URL}/table/v1/driving/`)).toBe(true);
  });

  test('bez internetu zwraca błąd (wtedy użytkownik może wybrać kolejność szacunkową)', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as any;
    await expect(fetchOsrmRoadMatrix(krakowPoints, { criterion: 'duration' })).rejects.toThrow(/OSRM/);
  });
});
