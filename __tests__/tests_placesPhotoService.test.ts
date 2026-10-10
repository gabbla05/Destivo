/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildGooglePlacesPhotoUrl,
  getCuratedCityFallback,
  hasCuratedCityFallback,
  fetchGoogleCityPhoto,
  fetchGooglePlacePhoto,
  enrichAttractionsWithGooglePhotos,
  GOOGLE_PLACES_CITY_PHOTO_REFS,
  CURATED_FALLBACK_URLS,
} from '../src/lib/placesPhotoService';
import * as config from '../src/lib/config';

describe('placesPhotoService - pobieranie zdjęć miast i atrakcji', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Narzędzia pomocnicze i fallbacki kuratorskie', () => {
    test('buildGooglePlacesPhotoUrl buduje prawidłowy URL do Google Places API', () => {
      const url = buildGooglePlacesPhotoUrl('REF_XYZ_123', 'TEST_KEY');
      expect(url).toBe(
        'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1000&photo_reference=REF_XYZ_123&key=TEST_KEY'
      );
    });

    test('hasCuratedCityFallback rozpoznaje miasta ze słownika', () => {
      expect(hasCuratedCityFallback('Rzym')).toBe(true);
      expect(hasCuratedCityFallback('kazimierz dolny')).toBe(true);
      expect(hasCuratedCityFallback('Włochy, Rzym')).toBe(true);
      expect(hasCuratedCityFallback('NieznanaWioska999')).toBe(false);
      expect(hasCuratedCityFallback('')).toBe(false);
      expect(hasCuratedCityFallback(undefined)).toBe(false);
    });

    test('getCuratedCityFallback zwraca URL dla znanych miast i pusty string dla nieznanych', () => {
      expect(getCuratedCityFallback('Kazimierz Dolny')).toBe(CURATED_FALLBACK_URLS['kazimierz dolny']);
      expect(getCuratedCityFallback('Paryż')).toContain('maps.googleapis.com');
      expect(getCuratedCityFallback('Atlantyda')).toBe('');
      expect(getCuratedCityFallback('')).toBe('');
      expect(getCuratedCityFallback(undefined)).toBe('');
    });
  });

  describe('2. fetchGoogleCityPhoto', () => {
    test('zwraca null dla pustej lub białoznakowej nazwy miasta', async () => {
      const res1 = await fetchGoogleCityPhoto('');
      const res2 = await fetchGoogleCityPhoto('   ');
      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    test('zwraca fallback kuratorski gdy klucz API jest tymczasowy lub pusty', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('TYMCZASOWY_KLUCZ');

      const photoUrl = await fetchGoogleCityPhoto('rzym');
      expect(photoUrl).toContain('maps.googleapis.com');
      expect(photoUrl).toContain(GOOGLE_PLACES_CITY_PHOTO_REFS['rzym']);

      // Dla miasta bez fallbacku zwraca null
      const unknownCity = await fetchGoogleCityPhoto('NieznanaWioska');
      expect(unknownCity).toBeNull();

      spy.mockRestore();
    });

    test('pobiera zdjęcie z API gdy Google Places zwraca poprawną odpowiedź', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');

      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          status: 'OK',
          candidates: [
            {
              photos: [{ photo_reference: 'LIVE_CITY_PHOTO_REF_888' }],
            },
          ],
        }),
      } as any);

      const photoUrl = await fetchGoogleCityPhoto('Florencja', 'Włochy');
      expect(photoUrl).toContain('LIVE_CITY_PHOTO_REF_888');

      spy.mockRestore();
    });

    test('obsługuje ZERO_RESULTS z Google Places API zwracając null', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');

      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          status: 'ZERO_RESULTS',
          candidates: [],
        }),
      } as any);

      const photoUrl = await fetchGoogleCityPhoto('JakiesPusteMiejsce');
      expect(photoUrl).toBeNull();

      spy.mockRestore();
    });

    test('obsługuje błąd sieci fetch z gracją', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      const photoUrl = await fetchGoogleCityPhoto('BłądMiasto');
      expect(photoUrl).toBeNull();

      warnSpy.mockRestore();
      spy.mockRestore();
    });
  });

  describe('3. fetchGooglePlacePhoto', () => {
    test('zwraca null dla pustej nazwy atrakcji lub gdy klucz API jest tymczasowy', async () => {
      expect(await fetchGooglePlacePhoto('')).toBeNull();
      expect(await fetchGooglePlacePhoto('   ')).toBeNull();

      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('TYMCZASOWY_KLUCZ');
      expect(await fetchGooglePlacePhoto('Koloseum', 'Rzym')).toBeNull();
      spy.mockRestore();
    });

    test('pobiera zdjęcie z findplacefromtext i zapisuje w cache (kolejne wywołanie z pamięci)', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');

      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          status: 'OK',
          candidates: [
            {
              photos: [{ photo_reference: 'COLOSSEUM_PHOTO_REF' }],
            },
          ],
        }),
      } as any);

      const photoUrl1 = await fetchGooglePlacePhoto('Koloseum Cached', 'Rzym');
      expect(photoUrl1).toContain('COLOSSEUM_PHOTO_REF');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Drugie wywołanie powinno zwrócić z cache MEMORY_CACHE bez kolejnego fetcha
      const photoUrl2 = await fetchGooglePlacePhoto('Koloseum Cached', 'Rzym');
      expect(photoUrl2).toBe(photoUrl1);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    test('jeśli findplacefromtext nie ma zdjęć, próbuje textsearch', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          // findplacefromtext bez zdjęć
          json: async () => ({
            status: 'OK',
            candidates: [{ name: 'Wieża Eiffla' }],
          }),
        } as any)
        .mockResolvedValueOnce({
          // textsearch ze zdjęciem
          json: async () => ({
            status: 'OK',
            results: [
              {
                name: 'Wieża Eiffla',
                photos: [{ photo_reference: 'EIFFEL_PHOTO_REF_TEXTSEARCH' }],
              },
            ],
          }),
        } as any);

      const photoUrl = await fetchGooglePlacePhoto('Wieża Eiffla', 'Paryż');
      expect(photoUrl).toContain('EIFFEL_PHOTO_REF_TEXTSEARCH');

      spy.mockRestore();
    });

    test('obsługuje błąd w trakcie pobierania zdjęcia atrakcji', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      global.fetch = jest.fn().mockRejectedValue(new Error('Connection timed out'));

      const photoUrl = await fetchGooglePlacePhoto('Nieudana Atrakcja');
      expect(photoUrl).toBeNull();

      warnSpy.mockRestore();
      spy.mockRestore();
    });
  });

  describe('4. enrichAttractionsWithGooglePhotos', () => {
    test('zwraca pustą listę lub oryginalną jeśli pusta', async () => {
      expect(await enrichAttractionsWithGooglePhotos([])).toEqual([]);
      expect(await enrichAttractionsWithGooglePhotos(null as any)).toBeNull();
    });

    test('nie pobiera ponownie zdjęć dla atrakcji, które już mają imageUrl', async () => {
      const attractions = [
        { name: 'Panteon', imageUrl: 'https://example.com/panteon.jpg' },
      ];

      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      const enriched = await enrichAttractionsWithGooglePhotos(attractions, 'Rzym');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(enriched[0].imageUrl).toBe('https://example.com/panteon.jpg');
    });

    test('wzbogaca atrakcje brakujące o zdjęcia z API', async () => {
      const spy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue('AIzaSyValidApiKey123');

      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          status: 'OK',
          candidates: [
            {
              photos: [{ photo_reference: 'TREVI_PHOTO_REF' }],
            },
          ],
        }),
      } as any);

      const attractions = [
        { name: 'Fontanna di Trevi' },
        { name: 'Schody Hiszpańskie', imageUrl: 'https://destivo.io/spanish_steps.jpg' },
      ];

      const enriched = await enrichAttractionsWithGooglePhotos(attractions, 'Rzym');
      expect(enriched[0].imageUrl).toContain('TREVI_PHOTO_REF');
      expect(enriched[1].imageUrl).toBe('https://destivo.io/spanish_steps.jpg');

      spy.mockRestore();
    });
  });
});
