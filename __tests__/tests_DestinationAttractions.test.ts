// __tests__/tests_DestinationAttractions.test.ts
import {
  getCuratedSuggestionsForDestination,
  normalizeCityKey,
  fetchDynamicGoogleAttractions,
  POPULAR_DESTINATION_ATTRACTIONS,
} from '../src/lib/destinationAttractions';

describe('Baza i mechanizm rekomendacji atrakcji dla miast (Fix 3.2)', () => {
  test('normalizeCityKey usuwa polskie i europejskie znaki diakrytyczne oraz spacje', () => {
    expect(normalizeCityKey('Kraków')).toBe('krakow');
    expect(normalizeCityKey('Paryż')).toBe('paryz');
    expect(normalizeCityKey('Wiedeń')).toBe('wieden');
    expect(normalizeCityKey('San Sebastián')).toBe('sansebastian');
  });

  test('getCuratedSuggestionsForDestination zwraca dedykowane atrakcje dla miast, które wcześniej były puste (Wiedeń, Budapeszt, Berlin, Gdańsk, Lizbona)', () => {
    const viennaPl = getCuratedSuggestionsForDestination('Wiedeń', 'pl');
    expect(viennaPl.length).toBeGreaterThanOrEqual(3);
    expect(viennaPl.some((a) => a.name.includes('Schönbrunn'))).toBe(true);

    const budapestPl = getCuratedSuggestionsForDestination('Budapeszt', 'pl');
    expect(budapestPl.length).toBeGreaterThanOrEqual(3);
    expect(budapestPl.some((a) => a.name.includes('Parlament'))).toBe(true);

    const berlinPl = getCuratedSuggestionsForDestination('Berlin', 'pl');
    expect(berlinPl.length).toBeGreaterThanOrEqual(3);
    expect(berlinPl.some((a) => a.name.includes('Brandenburska'))).toBe(true);

    const gdanskPl = getCuratedSuggestionsForDestination('Gdańsk', 'pl');
    expect(gdanskPl.length).toBeGreaterThanOrEqual(3);
    expect(gdanskPl.some((a) => a.name.includes('Długi Targ'))).toBe(true);

    const lisbonPl = getCuratedSuggestionsForDestination('Lizbona', 'pl');
    expect(lisbonPl.length).toBeGreaterThanOrEqual(3);
    expect(lisbonPl.some((a) => a.name.includes('Hieronimitów') || a.name.includes('Belém'))).toBe(true);
  });

  test('getCuratedSuggestionsForDestination rozpoznaje angielskie nazwy miast (np. Vienna, Rome, Prague)', () => {
    const viennaEn = getCuratedSuggestionsForDestination('Vienna', 'en');
    expect(viennaEn.length).toBeGreaterThanOrEqual(2);
    expect(viennaEn[0].subtitle).toBeTruthy();

    const romeEn = getCuratedSuggestionsForDestination('Rome', 'en');
    expect(romeEn.length).toBeGreaterThanOrEqual(3);
    expect(romeEn.some((a) => a.name === 'Colosseum')).toBe(true);
  });

  test('getCuratedSuggestionsForDestination zwraca angielskie nazwy i opisy gdy language="en"', () => {
    const parisEn = getCuratedSuggestionsForDestination('Paryż', 'en');
    const eiffel = parisEn.find((a) => a.name.includes('Eiffel') || a.name.includes('Wieża'));
    expect(eiffel).toBeTruthy();
    expect(eiffel!.name).toBe('Eiffel Tower');
    expect(eiffel!.subtitle).toBe('Iconic panoramic landmark');
  });

  test('dla dowolnej nieznanej miejscowości lub wsi zwraca uniwersalny zestaw punktów zwiedzania (nigdy puste)', () => {
    const unknownPl = getCuratedSuggestionsForDestination('Mała Wieś pod Lasem', 'pl');
    expect(unknownPl.length).toBe(4);
    expect(unknownPl[0].name).toContain('Rynek i Stare Miasto');
    expect(typeof unknownPl[0].imageUrl).toBe('string');

    const unknownEn = getCuratedSuggestionsForDestination('Small Village', 'en');
    expect(unknownEn.length).toBe(4);
    expect(unknownEn[0].name).toContain('Old Town & Main Square');
  });

  test('dla pustego ciągu znaków zwraca pustą tablicę', () => {
    expect(getCuratedSuggestionsForDestination('', 'pl')).toEqual([]);
    expect(getCuratedSuggestionsForDestination('   ', 'pl')).toEqual([]);
  });

  test('fetchDynamicGoogleAttractions w środowisku testowym bezpiecznie zwraca pustą tablicę', async () => {
    const res = await fetchDynamicGoogleAttractions('Berlin', 'pl');
    expect(res).toEqual([]);

    const empty = await fetchDynamicGoogleAttractions('', 'pl');
    expect(empty).toEqual([]);
  });

  test('baza POPULAR_DESTINATION_ATTRACTIONS zawiera przynajmniej 15 unikalnych miast', () => {
    const keys = Object.keys(POPULAR_DESTINATION_ATTRACTIONS);
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });
});
