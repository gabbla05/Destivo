/// <reference types="jest" />
// P9: polityka prywatności opisuje rzeczywiste szyfrowanie (na urządzeniu), a nie "end-to-end".
import { translations } from '../src/i18n/translations';

describe('Tekst polityki prywatności', () => {
  test.each(['pl', 'en'] as const)('%s: brak obietnicy szyfrowania end-to-end, jest opis AES-256-GCM i RLS', (lang) => {
    const text = translations[lang].accountSecurity.privacyText;
    expect(text).not.toMatch(/end-to-end|E2E/i);
    expect(text).toContain('AES-256-GCM');
    expect(text).toContain('RLS');
  });
});
