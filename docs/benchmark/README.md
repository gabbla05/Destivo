# Benchmark algorytmów kolejności zwiedzania

Materiał do rozdziału pracy o optymalizacji trasy. Aplikacja **nie pokazuje** tych porównań
użytkownikowi. Benchmark wywołuje te same funkcje, których używa aplikacja
(`src/lib/routeOptimization.ts`).

Uruchomienie (wyniki i wykresy nadpisują się w tym folderze):

```
npm run benchmark
```

## Metodologia

| Parametr | Wartość |
|---|---|
| Problem | TSP w wariancie ścieżki otwartej ze stałym punktem startu (pierwsza atrakcja) |
| Dane | losowe punkty w prostokącie obejmującym centrum Krakowa (lat 50,02–50,10, lon 19,88–20,05) |
| Rozmiary | n = 5, 6, 7, 8, 10, 12, 15, 20, 25, 30 |
| Powtórzenia | 20 zestawów punktów na każde n |
| Losowość | generator mulberry32, ziarno `20261115 + 1000·n + nr_powtórzenia`; to samo ziarno w symulowanym wyżarzaniu, więc wyniki są w pełni powtarzalne |
| Macierz kosztów | odległość w linii prostej (haversine, km) |
| Trasa wejściowa | kolejność dodania punktów (0, 1, …, n−1), czyli tak, jak użytkownik dodaje atrakcje |
| Pomiar czasu | `performance.now()` wokół wywołania funkcji. Czas 2-opt i wyżarzania obejmuje też trasę startową z algorytmu zachłannego, bo tak działa aplikacja |
| Punkt odniesienia | n ≤ 8: wynik metody dokładnej (optimum). n > 8: najlepszy wynik spośród heurystyk (metoda dokładna jest w aplikacji ograniczona do n ≤ 8) |
| Sprzęt pomiaru z 15.11.2026 | Intel Core Ultra 5 226V, Windows 11, Node.js 24.15 (Jest + Babel) |

Na telefonie bezwzględne czasy będą kilka razy dłuższe (silnik Hermes, słabszy procesor).
Proporcje między algorytmami i kształt krzywych pozostają takie same.

## Algorytmy

1. **Zachłanny (najbliższy sąsiad)**: zawsze idzie do najbliższego nieodwiedzonego punktu.
2. **2-opt**: poprawia trasę zachłanną, odwracając odcinki, dopóki daje to skrócenie.
3. **Symulowane wyżarzanie**: startuje z trasy zachłannej i przyjmuje też gorsze ruchy z malejącym prawdopodobieństwem. Ma stały budżet iteracji.
4. **Metoda dokładna**: przegląd wszystkich permutacji. Daje optimum, ale tylko dla n ≤ 8.

## Najważniejsze wyniki (pomiar z 15.11.2026)

| n | Algorytm | Mediana czasu | Średnie odchylenie | Optimum w % przypadków | Skrócenie względem trasy wejściowej |
|---|---|---|---|---|---|
| 8 | Zachłanny | 0,03 ms | 6,30% | 45% | 42,2% |
| 8 | 2-opt | 0,13 ms | 0,12% | 95% | 45,5% |
| 8 | Wyżarzanie | 1,29 ms | 0,06% | 95% | 45,5% |
| 8 | Dokładna | 2,11 ms | 0% | 100% | 45,6% |
| 12 | Zachłanny | 0,05 ms | 10,85% | 25% | 51,2% |
| 12 | 2-opt | 0,37 ms | 0,62% | 75% | 55,8% |
| 12 | Wyżarzanie | 1,45 ms | 1,28% | 80% | 55,4% |
| 30 | Zachłanny | 0,25 ms | 12,38% | 0% | 68,6% |
| 30 | 2-opt | 4,74 ms | 0% | 100% | 72,0% |
| 30 | Wyżarzanie | 2,04 ms | 12,02% | 0% | 68,7% |

Wnioski:

- **Metoda dokładna** rośnie wykładniczo: przy n = 8 jest już wolniejsza od heurystyk, a dla n > 8 jest niepraktyczna.
- **Zachłanny** jest najszybszy, ale średnio o 6–14% gorszy od najlepszej trasy.
- **2-opt** daje najlepszy stosunek jakości do czasu. Dla n ≤ 8 prawie zawsze trafia w optimum, a dla dużych n jest najlepszą z heurystyk.
- **Symulowane wyżarzanie** przy stałym budżecie iteracji dorównuje 2-opt dla małych n, ale dla n ≥ 15 nie zdąży poprawić trasy startowej i zostaje blisko wyniku zachłannego. To argument za uzależnieniem liczby iteracji od n albo za łączeniem wyżarzania z 2-opt.

Dla n > 8 „odchylenie” liczone jest względem najlepszego znalezionego wyniku, a nie prawdziwego optimum, więc jest dolnym oszacowaniem błędu.

## Pliki

| Plik | Zawartość |
|---|---|
| `results.csv` | każdy pojedynczy pomiar (n, powtórzenie, ziarno, algorytm, koszt, czas, iteracje, odchylenie, skrócenie) |
| `summary.csv` | agregaty dla każdej pary n × algorytm (mediana czasu, średnie i maksymalne odchylenie, odsetek trafień w optimum) |
| `results.json` | to samo co wyżej oraz metadane pomiaru (sprzęt, ziarna, parametry) |
| `time_vs_n.svg` | czas obliczeń w funkcji n, skala logarytmiczna |
| `gap_vs_n.svg` | średnie odchylenie od optimum w funkcji n |
| `boxplot_gap_n12.svg` | rozkład odchylenia dla n = 12 |

Wykresy są w formacie wektorowym SVG: wstawiają się do Worda (Wstaw → Obrazy) i LaTeX-a
(pakiet `svg`) bez utraty jakości. Każda seria ma własny kolor i kształt znacznika, więc
wykresy są czytelne także w druku czarno-białym.

## Ograniczenia i możliwe rozszerzenia

- Macierz haversine nie uwzględnia sieci ulic. Aplikacja w trybie z serwerem OSRM optymalizuje czas przejazdu. Porównanie obu macierzy wymaga działającego serwera OSRM i nie jest częścią tego pomiaru.
- Punkty są losowe w jednolitym rozkładzie. Prawdziwe atrakcje skupiają się w centrum, co zwykle ułatwia zadanie heurystykom.
