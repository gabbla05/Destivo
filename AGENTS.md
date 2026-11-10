# Destivo - wskazówki dla agentów AI

Projekt używa **Expo SDK 54** (React Native 0.81, React 19.1).
Przed pisaniem kodu korzystaj z dokumentacji dla tej wersji: https://docs.expo.dev/versions/v54.0.0/

- Klucze API trzymamy wyłącznie w `.env` (szablon: `.env.example`), nigdy w kodzie.
- Testy: `npm test`, sprawdzenie typów: `npx tsc --noEmit`, sprawdzenie kluczy: `npm run check:env`.
