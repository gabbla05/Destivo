/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildGooglePlacesPhotoUrl,
  fetchGoogleCityPhoto,
  fetchGooglePlacePhoto,
  enrichAttractionsWithGooglePhotos,
  getCachedCityPhoto,
  isReusablePhotoUrl,
  PHOTO_TTL_MS,
  __resetPlacesPhotoCacheForTests,
} from '../src/lib/placesPhotoService';
import * as config from '../src/lib/config';

const VALID_KEY = 'AIzaSyValidApiKey123';

const findPlaceResponse = (ref?: string) => ({
  json: async () => ({
    status: 'OK',
    candidates: [ref ? { photos: [{ photo_reference: ref }] } : { name: 'bez zdjęcia' }],
  }),
});

describe('placesPhotoService - zdjęcia wyłącznie z Google Places', () => {
  const originalFetch = global.fetch;
  let keySpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetPlacesPhotoCacheForTests();
    await AsyncStorage.clear();
    keySpy = jest.spyOn(config, 'getGoogleApiKey').mockReturnValue(VALID_KEY);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    keySpy.mockRestore();
    jest.useRealTimers();
  });

  describe('1. Narzędzia pomocnicze', () => {
    test('buildGooglePlacesPhotoUrl buduje prawidłowy URL do Google Places API', () => {
      expect(buildGooglePlacesPhotoUrl('REF_XYZ_123', 'TEST_KEY')).toBe(
        'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1000&photo_reference=REF_XYZ_123&key=TEST_KEY'
      );
      expect(buildGooglePlacesPhotoUrl('REF', 'K', 800)).toContain('maxwidth=800');
    });

    test('isReusablePhotoUrl odrzuca zdjęcia zastępcze i wygasające odwołania Google', () => {
      expect(isReusablePhotoUrl('https://images.unsplash.com/photo-1?w=800')).toBe(false);
      expect(
        isReusablePhotoUrl('https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=X&key=K')
      ).toBe(false);
      expect(isReusablePhotoUrl('')).toBe(false);
      expect(isReusablePhotoUrl(undefined)).toBe(false);
      expect(isReusablePhotoUrl('file:///data/user/photo.jpg')).toBe(true);
      expect(isReusablePhotoUrl('https://example.com/panteon.jpg')).toBe(true);
    });
  });

  describe('2. fetchGoogleCityPhoto', () => {
    test('zwraca null dla pustej nazwy miasta', async () => {
      expect(await fetchGoogleCityPhoto('')).toBeNull();
      expect(await fetchGoogleCityPhoto('   ')).toBeNull();
    });

    test('bez klucza API zwraca null i nie podsuwa żadnego zdjęcia zastępczego', async () => {
      keySpy.mockReturnValue('');
      global.fetch = jest.fn();
      expect(await fetchGoogleCityPhoto('Rzym')).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('pobiera zdjęcie z API, gdy Google Places zwraca poprawną odpowiedź', async () => {
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('LIVE_CITY_PHOTO_REF_888')) as any;
      const photoUrl = await fetchGoogleCityPhoto('Florencja', 'Włochy');
      expect(photoUrl).toContain('LIVE_CITY_PHOTO_REF_888');
      expect(photoUrl).toContain('maxwidth=1000');
    });

    test('ZERO_RESULTS z obu wyszukiwarek zwraca null', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ status: 'ZERO_RESULTS', candidates: [], results: [] }),
      }) as any;
      expect(await fetchGoogleCityPhoto('JakiesPusteMiejsce')).toBeNull();
    });

    test('błąd sieci zwraca null i nie zapamiętuje porażki', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline')) as any;
      expect(await fetchGoogleCityPhoto('BłądMiasto')).toBeNull();

      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('RETRY_REF')) as any;
      expect(await fetchGoogleCityPhoto('BłądMiasto')).toContain('RETRY_REF');
      warnSpy.mockRestore();
    });

    test('REQUEST_DENIED nie jest zapamiętywane jako brak zdjęcia', async () => {
      global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ status: 'REQUEST_DENIED' }) }) as any;
      expect(await fetchGoogleCityPhoto('Werona')).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('VERONA_REF')) as any;
      expect(await fetchGoogleCityPhoto('Werona')).toContain('VERONA_REF');
    });
  });

  describe('3. fetchGooglePlacePhoto i pamięć podręczna', () => {
    test('zwraca null dla pustej nazwy lub tymczasowego klucza', async () => {
      expect(await fetchGooglePlacePhoto('')).toBeNull();
      keySpy.mockReturnValue('TYMCZASOWY_KLUCZ');
      expect(await fetchGooglePlacePhoto('Koloseum', 'Rzym')).toBeNull();
    });

    test('zapamiętuje wynik - drugie wywołanie nie odpytuje Google', async () => {
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('COLOSSEUM_PHOTO_REF')) as any;

      const first = await fetchGooglePlacePhoto('Koloseum', 'Rzym');
      const second = await fetchGooglePlacePhoto('Koloseum', 'Rzym');
      expect(first).toContain('COLOSSEUM_PHOTO_REF');
      expect(first).toContain('maxwidth=800');
      expect(second).toBe(first);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('pamięć przechowuje odwołanie, a URL buduje z bieżącym kluczem', async () => {
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('REF_A')) as any;
      await fetchGooglePlacePhoto('Panteon', 'Rzym');

      keySpy.mockReturnValue('AIzaSyNewRotatedKey999');
      const url = await fetchGooglePlacePhoto('Panteon', 'Rzym');
      expect(url).toContain('REF_A');
      expect(url).toContain('key=AIzaSyNewRotatedKey999');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('wpis starszy niż 7 dni jest pobierany na nowo', async () => {
      jest.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('OLD_REF')) as any;
      await fetchGooglePlacePhoto('Wawel', 'Kraków');

      jest.setSystemTime(new Date(Date.parse('2026-01-01T10:00:00Z') + PHOTO_TTL_MS + 1000));
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('NEW_REF')) as any;
      const url = await fetchGooglePlacePhoto('Wawel', 'Kraków');
      expect(url).toContain('NEW_REF');
    });

    test('pamięć przetrwa restart (AsyncStorage)', async () => {
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('PERSISTED_REF')) as any;
      await fetchGoogleCityPhoto('Gdańsk', 'Polska');
      await new Promise((r) => setImmediate(r));

      __resetPlacesPhotoCacheForTests();
      global.fetch = jest.fn();
      expect(await getCachedCityPhoto('Gdańsk', 'Polska')).toContain('PERSISTED_REF');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('getCachedCityPhoto nie odpytuje sieci i zwraca pusty string bez danych', async () => {
      global.fetch = jest.fn();
      expect(await getCachedCityPhoto('Atlantyda')).toBe('');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('jeśli findplacefromtext nie ma zdjęć, próbuje textsearch', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(findPlaceResponse())
        .mockResolvedValueOnce({
          json: async () => ({
            status: 'OK',
            results: [{ name: 'Wieża Eiffla', photos: [{ photo_reference: 'EIFFEL_PHOTO_REF_TEXTSEARCH' }] }],
          }),
        }) as any;

      expect(await fetchGooglePlacePhoto('Wieża Eiffla', 'Paryż')).toContain('EIFFEL_PHOTO_REF_TEXTSEARCH');
    });

    test('usuwa stare wersje pamięci z wygasłymi odwołaniami', async () => {
      await AsyncStorage.setItem('@destivo_places_photos_v2', JSON.stringify({ x: 'expired' }));
      global.fetch = jest.fn();
      await getCachedCityPhoto('Rzym');
      expect(await AsyncStorage.getItem('@destivo_places_photos_v2')).toBeNull();
    });
  });

  describe('4. enrichAttractionsWithGooglePhotos', () => {
    test('zwraca pustą listę lub oryginalną wartość', async () => {
      expect(await enrichAttractionsWithGooglePhotos([])).toEqual([]);
      expect(await enrichAttractionsWithGooglePhotos(null as any)).toBeNull();
    });

    test('zachowuje własne zdjęcie atrakcji i nie odpytuje Google', async () => {
      global.fetch = jest.fn();
      const enriched = await enrichAttractionsWithGooglePhotos(
        [{ name: 'Panteon', imageUrl: 'https://example.com/panteon.jpg' }],
        'Rzym'
      );
      expect(global.fetch).not.toHaveBeenCalled();
      expect(enriched[0].imageUrl).toBe('https://example.com/panteon.jpg');
    });

    test('podmienia zdjęcia zastępcze (Unsplash) na prawdziwe zdjęcia z Google', async () => {
      global.fetch = jest.fn().mockResolvedValue(findPlaceResponse('TREVI_PHOTO_REF')) as any;
      const enriched = await enrichAttractionsWithGooglePhotos(
        [
          { name: 'Fontanna di Trevi' },
          { name: 'Wawel', imageUrl: 'https://images.unsplash.com/photo-sportscar.jpg' },
        ],
        'Rzym'
      );
      expect(enriched[0].imageUrl).toContain('TREVI_PHOTO_REF');
      expect(enriched[1].imageUrl).toContain('TREVI_PHOTO_REF');
    });

    test('gdy Google nie ma zdjęcia, usuwa zastępcze zdjęcie (placeholder w interfejsie)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ status: 'ZERO_RESULTS', candidates: [], results: [] }),
      }) as any;
      const enriched = await enrichAttractionsWithGooglePhotos(
        [{ name: 'Zamek w Malborku', imageUrl: 'https://images.unsplash.com/photo-obama.jpg' }],
        'Malbork'
      );
      expect(enriched[0].imageUrl).toBeUndefined();
    });
  });
});
