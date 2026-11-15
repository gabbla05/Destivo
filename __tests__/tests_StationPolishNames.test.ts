/// <reference types="jest" />
// Regresja: "Kraków" (z polskim znakiem) był traktowany jak wieś bez dworca,
// przez co trasa Warszawa -> Kraków proponowała tylko samochód.
import { checkDestinationStation, determineTransportRecommendations } from '../src/lib/geoDatabase';

describe('Dworzec w miastach z polskimi znakami', () => {
  test.each(['Kraków', 'Łódź', 'Gdańsk', 'Wrocław', 'krakow', 'Krakowa'])('%s ma stację kolejową', async (city) => {
    const info = await checkDestinationStation(city, { lat: 50.06, lon: 19.94 });
    expect(info.hasStation).toBe(true);
  });

  test('Warszawa -> Kraków proponuje pociąg', async () => {
    const info = await checkDestinationStation('Kraków', { lat: 50.0647, lon: 19.945 });
    const routes = determineTransportRecommendations('Warszawa', 'Kraków', 252, info);
    expect(routes.some((r: any) => r.type === 'train')).toBe(true);
  });
});
