# Plan poprawek po audycie Destivo

Audyt z 11.11.2026 wykazał atrapy, wartości zastępcze bez oznaczenia, niepodłączone funkcje i kilka realnych błędów. Ten dokument opisuje każdy problem w trzech krokach: **jak działa teraz**, **jak powinno działać** i **co dokładnie zrobić**. Kolejność etapów odpowiada priorytetom: najpierw to, co recenzent zauważy od razu albo co psuje działanie aplikacji.

**Legenda statusu:** ⬜ do zrobienia · 🟨 w trakcie · ✅ zrobione · ⏸️ czeka na decyzję

---

## Podjęte decyzje

| # | Pytanie | Decyzja |
|---|---|---|
| D1 | Jak naprawić „Usuń konto”? | **Dwie osobne opcje:** „Usuń moje dane” (podróże w chmurze i na telefonie, konto zostaje) oraz „Usuń konto” (prawdziwe usunięcie przez Edge Function `delete-account`) |
| D2 | Co z plakietką „☀️ 24°C”? | **Prawdziwa bieżąca pogoda** z OpenWeatherMap; bez danych plakietka znika |
| D3 | Co z geofencingiem w tle? | **Włączyć naprawdę** (lokalizacja w tle, powiadomienie po wejściu w strefę dworca lub lotniska) |
| D4 | Pokazać porównanie algorytmów w aplikacji? | **Nie.** Zamiast tego skrypt benchmarku poza aplikacją, który generuje dane i wykresy do pracy. Z modala usuwam zastępczy benchmark |

---

## Podsumowanie etapów

| Etap | Zakres | Szacunek |
|---|---|---|
| 0 | Przygotowanie | 10 min |
| 1 | Błędy krytyczne: zdjęcia, podgląd biletu, usuwanie konta | 4–5 h |
| 2 | Atrapy i wartości zastępcze | 3–4 h |
| 3 | Niepodłączone funkcje, geofencing, benchmark do pracy, drobne błędy | 7–10 h |
| 4 | README, testy, weryfikacja na telefonie, commity | 1–2 h |

---

## Etap 0: Przygotowanie

⬜ **0.1** Nowa gałąź `fix/audit-cleanup`, żeby `main` zostało nietknięte do czasu sprawdzenia.
⬜ **0.2** Punkt odniesienia: `npm test` (535 testów), `npx tsc --noEmit`, `npm run check:env`.

---

## Etap 1: Błędy krytyczne

### P1. Zdjęcia atrakcji i miast ✅

**Jak działa teraz**
- W kodzie jest wpisanych 55 zdjęć z Unsplash. Pasuje około 15. Reszta przedstawia inne miejsca albo przypadkowe obrazy (np. Zamek w Malborku to Barack Obama, Wawel to samochód sportowy, Kazimierz to Kreml), a 9 zwraca błąd 404.
  - 98 atrakcji w [destinationAttractions.ts](../src/lib/destinationAttractions.ts) (pole `imageUrl`),
  - mapa zdjęć miast w [TimelineScreen.tsx:106](../src/screens/TimelineScreen.tsx#L106),
  - `CURATED_FALLBACK_URLS` w [placesPhotoService.ts](../src/lib/placesPhotoService.ts),
  - zdjęcie Londynu (404) w [Step4AttractionsScreen.tsx:270](../src/screens/TripCreator/Step4AttractionsScreen.tsx#L270).
- 55 zapisanych odwołań do zdjęć Google (`GOOGLE_PLACES_CITY_PHOTO_REFS`) **wygasło**: każde zwraca błąd 400. Odwołania `photo_reference` z Google są z natury tymczasowe.
- Zdjęcia zapasowe mają **pierwszeństwo** przed Google:
  - `enrichAttractionsWithGooglePhotos` pomija atrakcje, które już mają `imageUrl` ([placesPhotoService.ts:303](../src/lib/placesPhotoService.ts#L303)), więc złe zdjęcia nigdy nie są podmieniane;
  - lista „Moje podróże” bierze najpierw wygasłe odwołanie i w ogóle nie pyta Google ([TripsListScreen.tsx:411](../src/screens/TripsListScreen.tsx#L411)), więc u ponad 60 miast kafelek ma zepsute zdjęcie;
  - Eksploruj startuje z wygasłych zdjęć (`coverImage: getCuratedCityFallback(...)` w `DESTINATION_POOL`).

**Jak powinno działać**
- Każde zdjęcie w aplikacji pochodzi z **Google Places na żywo** dla konkretnego miejsca albo nie ma go wcale. Wtedy widoczny jest neutralny placeholder (gradient + ikona). Interfejs ma już taki placeholder w propozycjach na ekranie „Dziś”.
- Pobrane adresy zdjęć są zapamiętywane, żeby nie płacić za te same zapytania do Places przy każdym otwarciu ekranu.

**Co zrobię**
1. Usunę wszystkie pola `imageUrl` z `POPULAR_DESTINATION_ATTRACTIONS` (nazwy i opisy zostają).
2. Usunę `GOOGLE_PLACES_CITY_PHOTO_REFS`, `CURATED_FALLBACK_URLS`, `CURATED_CITY_PHOTOS`, `getCuratedCityFallback`, `hasCuratedCityFallback` oraz mapę zdjęć w `TimelineScreen`.
3. Wszędzie, gdzie były używane (Eksploruj, Oś czasu, Moje podróże, ekran „Dziś”, propozycje atrakcji), przejdę na `fetchGoogleCityPhoto` / `fetchGooglePlacePhoto`.
4. Dodam pamięć podręczną adresów zdjęć: w pamięci + AsyncStorage, klucz `(nazwa, miasto)`, ważność 7 dni.
5. W kroku 4 zapisana atrakcja spoza wyników nie dostaje już zdjęcia Londynu (razem z P6).
6. Ujednolicę placeholder bez zdjęcia na wszystkich kartach (Eksploruj, Moje podróże, tło osi czasu).
7. **Test-strażnik:** test, który przeszukuje `src/` i nie przepuści `images.unsplash.com` ani zaszytych `photo_reference`. Błąd nie wróci przy przyszłych zmianach.

**Weryfikacja:** testy `placesPhotoService` i `DestinationAttractions` zaktualizowane. Na telefonie przegląd Eksploruj, Moich podróży, Osi czasu, propozycji na „Dziś” i kroku 4: każde zdjęcie pasuje do miejsca albo jest placeholder.

---

### P2. „Bilet w zasięgu ręki” pokazuje zaszyfrowany plik ✅

**Jak działa teraz**
- Bilety wgrywane w kroku 2 kreatora są zapisywane przez `VaultManager.pickFile()`, czyli **zaszyfrowane** (`.vault`).
- [QuickTicketPassModal.tsx](../src/components/QuickTicketPassModal.tsx) przekazuje ten plik bez odszyfrowania:
  - do `<Image source={{ uri }}>` (linia 569), więc zdjęcie biletu się nie wyświetla;
  - do „Otwórz w aplikacji PDF” i „Udostępnij” (linia 309), więc na zewnątrz trafia nieczytelny plik `.vault`.
- Błąd pojawił się razem z commitem „vault encryption”. Testy go nie wyłapały, bo używają atrap plików.

**Jak powinno działać**
Po otwarciu podglądu bilet jest odszyfrowywany do pliku tymczasowego. Zdjęcie się wyświetla, PDF otwiera się poprawnie, a udostępniany jest czytelny plik. Po zamknięciu podglądu plik tymczasowy jest usuwany. Starsze, niezaszyfrowane bilety działają jak dotąd.

**Co zrobię**
1. W modalu, przy zmianie odcinka (tam / powrót) lub otwarciu: jeśli `encryptionVersion === 1`, wywołam `VaultManager.createDecryptedTemporaryCopy(file)` i będę używać zwróconego `uri`.
2. Dodam stan ładowania (spinner) i błędu (istniejący komunikat `readError`).
3. Przy zamknięciu modala, zmianie odcinka i odmontowaniu usunę plik tymczasowy (`VaultManager.deleteFile`).
4. Sprawdzę wszystkie trzy wejścia do modala: baner bliskości, powiadomienie i oś czasu.
5. Test komponentu z zaszyfrowanym plikiem: odszyfrowanie zostało wywołane, `Image` dostaje plik tymczasowy, plik jest sprzątany po zamknięciu.

**Weryfikacja:** na telefonie wgranie biletu (zdjęcie i PDF) w kreatorze, potem otwarcie „Bilet w zasięgu ręki”, sprawdzenie podglądu, „Otwórz” i „Udostępnij”.

---

### P3. „Usuń konto bezpowrotnie” nie usuwa konta ✅ (decyzja D1: dwie osobne opcje)

**Jak działa teraz**
[AccountSecurityScreen.tsx:112](../src/screens/AccountSecurityScreen.tsx#L112) usuwa podróże z tabeli `trips`, czyści lokalną bazę i wylogowuje. **Konto w Supabase Auth zostaje**: można się na nie zalogować tym samym hasłem. Komunikat obiecuje bezpowrotne usunięcie konta. Lokalnie zostają też pliki sejfu, lista pakowania i kopie w AsyncStorage.

**Jak powinno działać** (dwa osobne przyciski w „Konto i prywatność”)
- **„Usuń moje dane”:** usuwa wszystkie podróże z chmury i z telefonu, pliki sejfu, PIN i listy pakowania. Konto zostaje, a użytkownik zostaje zalogowany i może zacząć od nowa.
- **„Usuń konto”:** konto i wszystkie dane (w chmurze i na telefonie) znikają. Ponowne logowanie się nie udaje.

Każdy przycisk ma osobne potwierdzenie z dokładnym opisem, co zostanie usunięte. Zalogowany użytkownik potwierdza usunięcie konta hasłem.

**Co zrobię**
0. Wspólna funkcja `wipeLocalUserData()`: czyści lokalną bazę, kopie podróży w AsyncStorage, listy pakowania, sejf (`VaultManager.wipeVault()` + `resetPin()`) i zaplanowane powiadomienia. Używana przez obie opcje.
0a. „Usuń moje dane”: `supabase.from('trips').delete().eq('user_id', …)` z potwierdzeniem, że usunięcie się powiodło, a potem `wipeLocalUserData()`.
1. Nowa Edge Function `supabase/functions/delete-account`:
   - weryfikuje token użytkownika z nagłówka `Authorization` (`auth.getUser`),
   - kluczem `service_role` (dostępnym automatycznie w środowisku funkcji) usuwa wiersze z `trips` i wywołuje `auth.admin.deleteUser(user.id)`,
   - zwraca błąd 401 bez poprawnego tokenu, więc nie da się usunąć cudzego konta.
2. W aplikacji: `supabase.functions.invoke('delete-account')`. Po sukcesie: `wipeLocalUserData()` i wylogowanie.
3. Przy błędzie konto **nie** jest wylogowywane, a użytkownik widzi komunikat.
4. Gość widzi tylko „Usuń moje dane” (nie ma konta w chmurze).
5. Testy obu opcji: sukces, błąd funkcji, brak sieci, gość.
6. **Po Twojej stronie:** `supabase functions deploy delete-account`.

---

## Etap 2: Atrapy i wartości zastępcze

### P4. Stała plakietka „☀️ 24°C” ⬜ (decyzja D2)

**Jak działa teraz:** [HomeScreen.tsx:1368](../src/screens/HomeScreen.tsx#L1368) wyświetla `24°C` i ikonę słońca przy każdym punkcie „W TRAKCIE”, niezależnie od miejsca i pogody.

**Jak powinno działać:** plakietka pokazuje bieżącą temperaturę i ikonę pogody w miejscu podróży albo w ogóle się nie pojawia.

**Co zrobię**
1. Funkcja `fetchCurrentWeather(lat, lon)` w `liveExplore.ts` (OpenWeatherMap `/data/2.5/weather`) z pamięcią podręczną na 30 minut.
2. Współrzędne: nocleg, a gdy go brak, cel podróży (słownik `geoDatabase` lub geokodowanie).
3. Plakietka renderowana tylko wtedy, gdy są dane. Ikona odpowiada warunkom (słońce, chmury, deszcz, śnieg).
4. Test: brak danych oznacza brak plakietki, dane oznaczają właściwą temperaturę.

---

### P5. Zmyślona pogoda w Eksploruj, gdy API nie odpowiada ⬜

**Jak działa teraz**
- [liveExplore.ts:894](../src/lib/liveExplore.ts#L894) (`getFallbackRecommendations`) zwraca 10 miast z wpisanymi temperaturami (np. Rzym 22°C) i opisem „Bez opadów, idealnie na zwiedzanie”. Interfejs pokazuje to jako prognozę.
- W normalnej ścieżce brak pomiarów dla dnia zastępowany jest liczbą 20°C ([liveExplore.ts:1293](../src/lib/liveExplore.ts#L1293)).

**Jak powinno działać:** bez prognozy karty pokazują miejsce, odległość i transport, ale **bez temperatury**, z widoczną etykietą „Brak aktualnej prognozy”. Sortowanie odbywa się wtedy według odległości.

**Co zrobię**
1. W typie `ProposedTrip` pole `estimatedTemp` stanie się opcjonalne. Dodam pole `weatherSource: 'forecast' | 'unavailable'`.
2. Usunę stałe temperatury i opisy z `getFallbackRecommendations`, a sortowanie przestawię na odległość.
3. Interfejs: [HomeScreen.tsx:2363](../src/screens/HomeScreen.tsx#L2363) i [ExploreDetailsScreen.tsx:212](../src/screens/ExploreDetailsScreen.tsx#L212) ukrywają temperaturę i pokazują etykietę, gdy prognozy nie ma.
4. Brakujące dni w prognozie: średnia z dostępnych dni zamiast stałej 20°C.
5. Usunę nieużywane pole `crowdLevel` (stałe teksty, nigdzie niewyświetlane).
6. Testy `liveExplore` i `HomeScreen_Explore` dla trybu bez prognozy.

---

### P6. Krok 4 kreatora: zmyślona ocena 4.5 i atrakcje z Rzymu ⬜

**Jak działa teraz**
- [Step4AttractionsScreen.tsx:209](../src/screens/TripCreator/Step4AttractionsScreen.tsx#L209): `rating: place.rating || 4.5`, czyli brak oceny w Google staje się oceną 4.5.
- [Step4AttractionsScreen.tsx:152-155](../src/screens/TripCreator/Step4AttractionsScreen.tsx#L152): gdy geokodowanie noclegu się nie uda (brak sieci, limit Nominatim), przyjmowane są **współrzędne Rzymu**. Dla podróży do Gdańska użytkownik po cichu dostaje atrakcje z Rzymu.
- [Step4AttractionsScreen.tsx:262-270](../src/screens/TripCreator/Step4AttractionsScreen.tsx#L262): zapisana atrakcja spoza wyników dostaje ocenę 4.8, odległość 0, zdjęcie Londynu (404) i współrzędne Rzymu.

**Jak powinno działać:** ocena jest pokazywana tylko wtedy, gdy Google ją zwraca. Gdy nie da się ustalić położenia, użytkownik widzi komunikat z przyciskiem „Spróbuj ponownie”, a nie atrakcje z innego kraju.

**Co zrobię**
1. `rating` stanie się opcjonalne, a plakietka oceny będzie ukryta, gdy go brak.
2. Kolejność ustalania położenia: adres noclegu, potem cel podróży, oba przez `resolveCoordinates` z [geoDatabase.ts](../src/lib/geoDatabase.ts) (lokalny słownik działa też bez sieci, potem Nominatim). Gdy oba zawiodą: stan błędu z ponowieniem i brak zapytań do Places.
3. Zapisana atrakcja spoza wyników bierze dane z pamięci podręcznej wyników (`allFetchedAttractionsCache`), a gdy ich nie ma, wyświetla się bez oceny, odległości i zdjęcia (placeholder).
4. Testy: brak oceny, nieudane geokodowanie, zapisana atrakcja spoza wyników.

---

### P7. Kursy walut „zaktualizowane teraz”, choć są domyślne ⬜

**Jak działa teraz:** [currencyService.ts:36](../src/lib/currencyService.ts#L36) ustawia `cachedDate = new Date()`. Bez sieci i bez zapisanych kursów kalkulator pokazuje wpisane na sztywno kursy z informacją, że są aktualne na teraz.

**Jak powinno działać:** użytkownik widzi źródło kursu:
- „Kurs z {{czas}}” dla kursu pobranego na żywo,
- „Kurs z {{czas}} (offline)” dla kursu z pamięci,
- „Kurs orientacyjny, brak połączenia” dla kursu domyślnego.

**Co zrobię**
1. `fetchLiveExchangeRates` zwróci `lastUpdated: Date | null` i `source: 'live' | 'cache' | 'default'`.
2. Kalkulator na ekranie „Dziś” wyświetli odpowiedni opis. PDF Offline Briefing dostanie tę samą informację przy kursie.
3. Nowe tłumaczenia PL/EN i testy trzech przypadków.

---

### P8. Asystent pakowania nie oznacza szacunku klimatycznego ⬜

**Jak działa teraz:** gdy termin podróży jest poza zasięgiem prognozy, `getClimaticDefaultWeather` zwraca szacunek z flagą `isEstimated: true`. [SmartPackingModal.tsx:279](../src/components/SmartPackingModal.tsx#L279) pokazuje go jednak jak prognozę.

**Jak powinno działać:** pigułka pogody mówi „Prognoza (Open-Meteo)” albo „Szacunek klimatyczny dla {{miesiąc}}”.

**Co zrobię:** użyję istniejących pól `isEstimated` i `source` w `getWeatherBadgeText`, dodam tłumaczenia i test.

---

### P9. Polityka prywatności: nieprawdziwe „szyfrowanie end-to-end” ⬜

**Jak działa teraz:** tekst w [translations.ts](../src/i18n/translations.ts) (klucz `privacyData`, PL i EN) mówi, że dane są „szyfrowane end-to-end w module Sejfu”. Sejf szyfruje pliki lokalnie i nigdzie ich nie wysyła, więc to szyfrowanie danych w spoczynku, nie E2E.

**Jak powinno działać / co zrobię:** nowy tekst (PL i EN): „Pliki w Sejfie są szyfrowane na urządzeniu (AES-256-GCM), a klucz jest przechowywany w sprzętowym magazynie kluczy telefonu. Pliki Sejfu nie są wysyłane do chmury. Podróże zalogowanych użytkowników są przechowywane w Supabase i chronione regułami dostępu (RLS).”

---

### P10. Kody QR w PDF sugerujące bilet ⬜

**Jak działa teraz**
- Nagłówek PDF zawiera kod QR z podsumowaniem podróży, podpisany **„OFFLINE PASS”** ([offlineTravelBriefing.ts:1076](../src/lib/offlineTravelBriefing.ts#L1076)). Wygląda jak bilet, a nim nie jest.
- `prepareVaultTickets` ([offlineTravelBriefing.ts:565](../src/lib/offlineTravelBriefing.ts#L565)), gdy nie znajdzie kodu w bilecie, generuje **zastępczy QR z metadanymi Destivo** w miejscu kodu biletu. Dziś to nieaktywne (P11), ale po podłączeniu pokazywałoby fałszywy „bilet”.

**Jak powinno działać / co zrobię**
1. Podpis zmieniony na „PODSUMOWANIE PODRÓŻY” / „TRIP SUMMARY”.
2. Usunięty zastępczy QR: `qrCodeDataUrl` pochodzi wyłącznie z kodu odczytanego lub wyciętego z biletu. Gdy kodu nie ma, pole jest puste, a interfejs pokazuje oryginalny plik.
3. Aktualizacja testów `OfflineTravelBriefing`.

---

## Etap 3: Niepodłączone funkcje i drobne błędy

### P11. Wykrywanie kodów QR z biletów: podłączenie do interfejsu ⬜ (po P2 i P10)

**Jak działa teraz:** moduł wykrywania QR (zdjęcia przez jsQR, PDF przez wyszukiwanie osadzonych obrazów i dekompresję strumieni) jest zaimplementowany i przetestowany, ale `prepareVaultTickets` **nie jest wywoływane nigdzie w aplikacji**.

**Jak powinno działać**
- „Bilet w zasięgu ręki” najpierw próbuje znaleźć kod QR w bilecie. Jeśli go znajdzie, pokazuje go **dużego, wygenerowanego na nowo, na białym tle** (najłatwiejszy do zeskanowania), z przełącznikiem „Pokaż oryginał”. Jeśli nie znajdzie, pokazuje oryginalny plik jak po P2.
- PDF Offline Briefing zawiera sekcję „Bilety” z kodami odczytanymi z biletów tej podróży (tylko prawdziwe kody).

**Co zrobię**
1. W modalu, po odszyfrowaniu (P2): `VaultManager.readFileAsBase64` → `Buffer` → `detectAndCropQrFromImage` lub `detectAndCropQrFromPdf`. Uruchomienie po zakończeniu animacji (`InteractionManager`), ze spinnerem, a wynik zapamiętany per plik.
2. Widok kodu + przełącznik „Pokaż oryginał”.
3. W `generateBriefingHtml`: sekcja „Bilety” z wynikami `prepareVaultTickets` dla biletów podróży.
4. Testy: wykryty kod, brak kodu (pokazany oryginał), PDF z sekcją biletów.
5. Pomiar czasu wykrywania na typowym bilecie PDF na telefonie. Jeśli jest zbyt wolno, ograniczę skanowanie do pierwszej strony lub największych obrazów.

---

### P12. Benchmark algorytmów do pracy (poza aplikacją) ⬜ (decyzja D4)

**Jak działa teraz**
- `optimizeSightseeingRoute` liczy wyniki czterech algorytmów (zachłanny, 2-opt, symulowane wyżarzanie, dokładny dla n ≤ 8) z czasem i liczbą iteracji, ale wyniki nie trafiają nigdzie poza testy.
- Tryb wielodniowy w [RouteOptimizationModal.tsx](../src/components/RouteOptimizationModal.tsx) wpisuje w wynik zastępczy benchmark (`timeMs: 1`, `iterations: 1`, `savingsPercent: 0`, linie 504–522).
- Nie ma powtarzalnego sposobu na wygenerowanie danych i wykresów do pracy.

**Jak powinno działać:** aplikacja dla użytkownika zostaje bez zmian (bez porównania algorytmów). Jedno polecenie `npm run benchmark` generuje dane pomiarowe i wykresy gotowe do wstawienia do pracy.

**Co zrobię**
1. Usunę zastępczy benchmark z modala. Wynik dnia nie będzie udawał pomiarów.
2. Skrypt `scripts/benchmark-tsp.ts` (uruchamiany przez Jest lub `tsx`, bez interfejsu aplikacji), wywołujący te same funkcje z `routeOptimization.ts`:
   - **scenariusze:** losowe zestawy punktów w Krakowie (n = 5, 6, 7, 8, 10, 12, 15, 20, 25, 30), po 20 powtórzeń z ustalonymi ziarnami losowości (wyniki powtarzalne);
   - **macierze:** odległości w linii prostej (haversine) i, opcjonalnie, rzeczywiste czasy przejazdu z serwera OSRM dla Krakowa (gdy jest włączony);
   - **mierzone wartości:** koszt trasy, czas obliczeń, liczba iteracji, odchylenie od optimum (dla n ≤ 8 względem metody dokładnej, dla większych n względem najlepszego znalezionego wyniku), poprawa względem trasy wejściowej.
3. Wyniki zapisywane w `docs/benchmark/` jako CSV i JSON.
4. **Wykresy** (PNG + SVG, gotowe do druku) w `docs/benchmark/`:
   - czas obliczeń w funkcji n, dla każdego algorytmu (skala logarytmiczna, widać wykładniczy wzrost metody dokładnej);
   - odchylenie od optimum w % w funkcji n (jakość rozwiązań);
   - rozkład jakości dla wybranego n (wykres pudełkowy);
   - porównanie macierzy haversine i OSRM: o ile trasa „najkrótsza w linii prostej” jest dłuższa w rzeczywistym czasie przejazdu (gdy OSRM jest dostępny).
5. Krótki plik `docs/benchmark/README.md` z opisem metodologii (sprzęt, liczba powtórzeń, ziarna), do przeniesienia do rozdziału pracy.

---

### P13. Geofencing w tle: włączenie ⬜ (decyzja D3)

**Jak działa teraz:** `setupGeofencingForTrip` i zadanie w tle w [proximityAlertService.ts:722-815](../src/lib/proximityAlertService.ts#L722) **nigdy nie są wywoływane**. Działa baner przy otwartej aplikacji i powiadomienie planowane według godziny odjazdu. W [app.json](../app.json) brakuje konfiguracji lokalizacji w tle.

**Jak powinno działać**
- Przed odjazdem aplikacja rejestruje w systemie strefę wokół miejsca odjazdu (lotnisko 1,5 km, dworzec 600 m, dworzec autobusowy 500 m).
- Gdy użytkownik wejdzie w strefę, **nawet przy zamkniętej aplikacji**, dostaje powiadomienie „Jesteś w pobliżu stacji odjazdu – bilet gotowy”. Kliknięcie otwiera „Bilet w zasięgu ręki”.
- Strefa jest usuwana po odjeździe, po usunięciu podróży i po wylogowaniu.
- Użytkownik, który nie da zgody na lokalizację w tle, dalej ma baner przy otwartej aplikacji i powiadomienie według czasu.

**Co zrobię**
1. Konfiguracja: plugin `expo-location` z włączoną lokalizacją w tle na Androidzie, uprawnienia `ACCESS_FINE_LOCATION` i `ACCESS_BACKGROUND_LOCATION`, plugin `expo-notifications`. Potem `npx expo prebuild -p android`.
2. **Zgoda w dwóch krokach** (wymóg Androida): najpierw lokalizacja podczas używania, potem osobny ekran z wyjaśnieniem, po co jest lokalizacja w tle, i dopiero wtedy prośba systemowa. Odmowa nie blokuje niczego innego.
3. Rejestracja strefy dla najbliższego odjazdu (tam lub powrót) przy wczytaniu aktywnej podróży na ekranie „Dziś”, tylko gdy odjazd jest w ciągu 48 h i znane są współrzędne miejsca odjazdu.
4. Zadanie w tle (`TaskManager.defineTask`) zarejestrowane na poziomie modułu, ładowane przy starcie aplikacji (wymóg Expo). Po wejściu w strefę: powiadomienie z danymi podróży i jednorazowa flaga, żeby nie powtarzać powiadomienia.
5. Sprzątanie stref: po odjeździe + 2 h, przy usunięciu podróży, przy wylogowaniu i usunięciu danych lub konta.
6. Przełącznik „Powiadomienia o zbliżaniu się do odjazdu” w profilu.
7. Testy jednostkowe logiki (wybór odjazdu, rejestracja i sprzątanie stref, obsługa zdarzenia wejścia). Testy na telefonie: symulacja lokalizacji w emulatorze Androida lub fałszywa lokalizacja na telefonie.
8. **Uwaga do publikacji w Google Play:** lokalizacja w tle wymaga deklaracji i uzasadnienia w konsoli Play. Do pracy i dystrybucji APK nie jest to potrzebne.

---

### P14. Transport: rekomendacja nazywana wyszukiwarką ⬜

**Jak działa teraz:** Edge Function `transport-search` dobiera rodzaj transportu według odległości w linii prostej i zwraca linki do Koleo, Skyscanner i Google Maps. Każda opcja dostaje stałe, nigdzie niewyświetlane pola: `badges: ['SMART_CHOICE']`, `stressScore: 3`, `dataConfidence: 'MEDIUM'` ([transportCalculator.ts:95-110](../src/lib/transportCalculator.ts#L95)).

**Jak powinno działać:** interfejs i dokumentacja mówią o **rekomendacji środka transportu** z przekierowaniem do rezerwacji. Kod nie zawiera udawanych metryk.

**Co zrobię**
1. Przejrzę teksty kroku 2 (PL/EN) i poprawię te, które sugerują wyszukiwanie połączeń lub cen.
2. Usunę stałe, nieużywane pola z `calculateSmartMetrics` i typu `TransportOption` (razem z nieużywanym `flightPricePln` w Eksploruj).
3. Nazwę funkcji w Supabase zostawię (zmiana wymagałaby ponownego wdrożenia), a w README i pracy opiszę ją jako rekomendację.

---

### P15. Statystyki archiwum: zaniżona liczba dni ⬜

**Jak działa teraz:** [TripsListScreen.tsx:546](../src/screens/TripsListScreen.tsx#L546) liczy dni jako różnicę dat, więc wyjazd poniedziałek–środa to 2 dni.

**Jak powinno działać / co zrobię:** liczenie włącznie (`różnica + 1`), więc pn–śr to 3 dni, a jednodniówka to 1 dzień. Do tego test.

---

## Etap 4: Domknięcie

⬜ **4.1** `npm test`, `npx tsc --noEmit`, próbna paczka `npx expo export --platform android`.
⬜ **4.2** Lista kontrolna na telefonie:

| Ekran | Co sprawdzić |
|---|---|
| Eksploruj | Zdjęcia pasują do miast; tryb samolotowy daje karty bez temperatury z etykietą |
| Szczegóły destynacji | Prognoza lub etykieta „brak prognozy” |
| Kreator, krok 4 | Oceny tylko z Google; bez sieci komunikat z ponowieniem zamiast Rzymu |
| Dziś | Plakietka pogody prawdziwa lub ukryta; opis źródła kursu walut |
| Oś czasu | Tło miasta z Google lub placeholder |
| Moje podróże | Zdjęcia kafelków działają |
| Bilet w zasięgu ręki | Zdjęcie i PDF biletu się otwierają; kod QR wykryty (P11) |
| Optymalizacja trasy | Działa jak wcześniej, bez zastępczych wartości (P12) |
| Geofencing | Zgoda na lokalizację w tle; powiadomienie po wejściu w strefę przy zamkniętej aplikacji (P13) |
| Konto | „Usuń moje dane” zostawia konto; „Usuń konto” uniemożliwia ponowne logowanie (P3) |
| Pakowanie | Etykieta prognozy lub szacunku |
| PDF | Podpis „Podsumowanie podróży”, sekcja biletów (P11), źródło kursu |

⬜ **4.3** Aktualizacja [README.md](../README.md): usunięcie naprawionych punktów z „Znanych ograniczeń” i opis nowych elementów (QR w podglądzie biletu, geofencing w tle, dwie opcje usuwania, `npm run benchmark`).
⬜ **4.4** Commity: po jednym na etap, z czytelnym opisem. Scalenie `fix/audit-cleanup` do `main` po Twojej akceptacji.

---

## Zależności między punktami

```
P2 (odszyfrowanie biletu) ──► P11 (QR w podglądzie)
P10 (bez zastępczego QR)  ──► P11 (sekcja biletów w PDF)
P1 (zdjęcia)              ──► P6 (zapisana atrakcja bez zdjęcia Londynu)
P5 (pogoda opcjonalna)    ──► P4 (wspólna funkcja pogody)
P2 (odszyfrowanie biletu) ──► P13 (powiadomienie z geofencingu otwiera bilet)
P3 (wipeLocalUserData)    ──► P13 (sprzątanie stref przy usuwaniu danych)
Wszystko                  ──► Etap 4
```
