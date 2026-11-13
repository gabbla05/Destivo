/// <reference types="jest" />
/**
 * Strażnik: Expo wstawia zmienne EXPO_PUBLIC_* do buildu tylko przy zapisie z kropką
 * (process.env.EXPO_PUBLIC_X). Zapis process.env['EXPO_PUBLIC_X'] albo destrukturyzacja
 * działa w testach, ale w aplikacji zawsze daje undefined (np. brak klucza Google).
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

const DYNAMIC_ENV_ACCESS = /process\.env\)?\s*\[|\}\s*=\s*process\.env\b|process\.env as /;

test('src odczytuje zmienne środowiskowe wyłącznie zapisem z kropką', () => {
  const offenders = listSourceFiles(SRC_DIR).flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && DYNAMIC_ENV_ACCESS.test(line))
      .map(({ idx }) => `${path.relative(SRC_DIR, file)}:${idx + 1}`)
  );
  expect(offenders).toEqual([]);
});
