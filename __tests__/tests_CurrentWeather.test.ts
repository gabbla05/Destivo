/// <reference types="jest" />
// P4: plakietka pogody przy punkcie "W TRAKCIE" pokazuje prawdziwą pogodę albo nic.
import {
  fetchCurrentWeather,
  fetchTripCurrentWeather,
  mapWeatherCode,
  __resetCurrentWeatherCacheForTests,
} from '../src/lib/currentWeather';
import * as config from '../src/lib/config';

const owmResponse = (temp: number, id: number, clouds = 0) => ({
  ok: true,
  json: async () => ({ main: { temp }, weather: [{ id }], clouds: { all: clouds } }),
});

describe('currentWeather', () => {
  const originalFetch = global.fetch;
  let keySpy: jest.SpyInstance;

  beforeEach(() => {
    __resetCurrentWeatherCacheForTests();
    keySpy = jest.spyOn(config, 'getWeatherApiKey').mockReturnValue('owm-test-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    keySpy.mockRestore();
  });

  test('mapuje kody OpenWeatherMap na ikonę i warunki', () => {
    expect(mapWeatherCode(800)).toEqual({ condition: 'clear', icon: 'sunny' });
    expect(mapWeatherCode(500)).toEqual({ condition: 'rain', icon: 'rainy' });
    expect(mapWeatherCode(601)).toEqual({ condition: 'snow', icon: 'snow' });
    expect(mapWeatherCode(211)).toEqual({ condition: 'storm', icon: 'thunderstorm' });
    expect(mapWeatherCode(804, 100)).toEqual({ condition: 'clouds', icon: 'cloudy' });
  });

  test('zwraca zaokrągloną temperaturę i ikonę z API', async () => {
    global.fetch = jest.fn().mockResolvedValue(owmResponse(7.6, 501)) as any;
    const weather = await fetchCurrentWeather(54.35, 18.65);
    expect(weather).toEqual({ tempC: 8, condition: 'rain', icon: 'rainy' });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('lat=54.35&lon=18.65');
  });

  test('pamięta wynik przez 30 minut', async () => {
    global.fetch = jest.fn().mockResolvedValue(owmResponse(20, 800)) as any;
    await fetchCurrentWeather(41.9, 12.5);
    await fetchCurrentWeather(41.9, 12.5);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('brak klucza, błąd API lub sieci -> null (bez zmyślonej temperatury)', async () => {
    keySpy.mockReturnValue('');
    global.fetch = jest.fn();
    expect(await fetchCurrentWeather(50, 20)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    keySpy.mockReturnValue('owm-test-key');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any;
    expect(await fetchCurrentWeather(50, 20)).toBeNull();

    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    expect(await fetchCurrentWeather(50.1, 20.1)).toBeNull();
  });

  test('dla podróży używa współrzędnych celu ze słownika miast', async () => {
    global.fetch = jest.fn().mockResolvedValue(owmResponse(3, 800)) as any;
    const weather = await fetchTripCurrentWeather({ destination: 'Kraków', lodging_data: '{}' });
    expect(weather?.tempC).toBe(3);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('lat=50.0647');
  });
});
