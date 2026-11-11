/// <reference types="jest" />
/**
 * Test-strażnik: aplikacja nie może zawierać zdjęć wpisanych na sztywno.
 * Wszystkie zdjęcia miejsc pochodzą z Google Places na żywo (placesPhotoService),
 * a przy braku zdjęcia interfejs pokazuje placeholder.
 *
 * Wykrywa:
 * - adresy z banków zdjęć (np. Unsplash), które w przeszłości przedstawiały przypadkowe obrazy,
 * - zaszyte odwołania `photo_reference` z Google (wygasają i zwracają błąd 400).
 */
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '..', 'src');

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });

const STOCK_PHOTO_URL = /https?:\/\/(images\.unsplash\.com|source\.unsplash\.com|images\.pexels\.com|picsum\.photos)/;
// photo_reference ma kilkaset znaków base64url; tak długich ciągów nie ma w zwykłym kodzie
const HARDCODED_PHOTO_REF = /['"`][A-Za-z0-9_-]{150,}['"`]/;
const HARDCODED_PLACES_PHOTO_URL = /photo_reference=[A-Za-z0-9_-]{20,}/;

describe('Strażnik: brak zdjęć wpisanych na sztywno', () => {
  const files = listSourceFiles(SRC_DIR);

  test('przeszukuje katalog src', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test.each([
    ['adresy z banków zdjęć', STOCK_PHOTO_URL],
    ['zaszyte odwołania photo_reference', HARDCODED_PHOTO_REF],
    ['gotowe adresy Google Places Photo', HARDCODED_PLACES_PHOTO_URL],
  ])('src nie zawiera: %s', (_label, pattern) => {
    const offenders = files.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => pattern.test(line))
        .map(({ idx }) => `${path.relative(SRC_DIR, file)}:${idx + 1}`)
    );
    expect(offenders).toEqual([]);
  });
});
