// src/lib/routeOptimization.ts
/**
 * Moduł Inteligentnej Optymalizacji Trasy Zwiedzania (Problem Komiwojażera / TSP)
 * Implementacja algorytmów optymalizacji kombinatorycznej dla pracy inżynierskiej:
 * - Algorytm Zachłanny (Nearest Neighbor / Greedy)
 * - Przeszukiwanie Lokalne (2-Opt Local Search)
 * - Symulowane Wyżarzanie (Simulated Annealing)
 * - Metoda Dokładna (Brute Force / Global Optimum dla N <= 8)
 * 
 * Zawiera wyznaczanie macierzy odległości (Formuła Haversine) oraz pomiary
 * wydajnościowe (czas obliczeń, iteracje, redukcja dystansu i czasu przejść).
 */

export interface GeoPoint {
  id: string;
  title: string;
  lat: number;
  lon: number;
  type?: string;
  subtitle?: string;
  originalIndex?: number;
}

export interface AlgorithmBenchmark {
  algorithmId: 'greedy' | '2opt' | 'simulated_annealing' | 'brute_force';
  name: string;
  distanceKm: number;
  timeMs: number;
  iterations: number;
  routeIndices: number[];
}

export interface OptimizationResult {
  orderedPoints: GeoPoint[];
  originalDistanceKm: number;
  optimizedDistanceKm: number;
  savingsKm: number;
  savingsPercent: number;
  timeSavedMinutes: number;
  bestAlgorithm: AlgorithmBenchmark;
  benchmarks: AlgorithmBenchmark[];
}

/**
 * Oblicza odległość ortodromiczną (w linii prostej po sferze ziemskiej)
 * pomiędzy dwoma punktami GPS za pomocą formuły Haversine.
 * @returns odległość w kilometrach
 */
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Średni promień Ziemi w km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
};

/**
 * Buduje symetryczną macierz odległości D[N x N] w kilometrach.
 */
export const buildDistanceMatrix = (points: GeoPoint[]): number[][] => {
  const n = points.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = haversineDistance(
        points[i].lat,
        points[i].lon,
        points[j].lat,
        points[j].lon
      );
      matrix[i][j] = dist;
      matrix[j][i] = dist;
    }
  }

  return matrix;
};

/**
 * Oblicza sumaryczną długość ścieżki (otwartej) przechodzącej przez punkty w danej kolejności.
 */
export const calculatePathDistance = (route: number[], matrix: number[][]): number => {
  if (route.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += matrix[route[i]][route[i + 1]];
  }
  return total;
};

/**
 * 1. Algorytm Zachłanny (Nearest Neighbor)
 * Rozpoczyna od pierwszego punktu (np. noclegu / punktu startowego) i w każdym kroku
 * wybiera najbliższy jeszcze nieodwiedzony punkt.
 * Złożoność obliczeniowa: O(N^2)
 */
export const solveGreedyTSP = (
  matrix: number[][],
  startIndex: number = 0
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  const start = Date.now();
  const n = matrix.length;
  if (n <= 1) {
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }

  const visited = new Set<number>();
  visited.add(startIndex);
  const route: number[] = [startIndex];
  let iterations = 0;

  while (visited.size < n) {
    const current = route[route.length - 1];
    let nearestNode = -1;
    let minDistance = Infinity;

    for (let next = 0; next < n; next++) {
      iterations++;
      if (!visited.has(next)) {
        const d = matrix[current][next];
        if (d < minDistance) {
          minDistance = d;
          nearestNode = next;
        }
      }
    }

    if (nearestNode !== -1) {
      visited.add(nearestNode);
      route.push(nearestNode);
    } else {
      break;
    }
  }

  const distance = calculatePathDistance(route, matrix);
  const timeMs = Math.max(1, Date.now() - start);

  return { route, distance, iterations, timeMs };
};

/**
 * 2. Algorytm 2-Opt (Local Search)
 * Iteracyjne usuwanie przecinających się krawędzi poprzez odwracanie pod-ścieżek.
 * Złożoność: O(k * N^2), gdzie k to liczba iteracji do osiągnięcia lokalnego optimum.
 */
export const solveTwoOptTSP = (
  initialRoute: number[],
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  const start = Date.now();
  let route = [...initialRoute];
  const n = route.length;
  if (n <= 2) {
    return {
      route,
      distance: calculatePathDistance(route, matrix),
      iterations: 1,
      timeMs: 0,
    };
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;
  const startIndex = fixStart ? 1 : 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = startIndex; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Sprawdzamy zysk z odwrócenia fragmentu route[i..j]
        const prevNode = i > 0 ? route[i - 1] : -1;
        const nextNode = j < n - 1 ? route[j + 1] : -1;

        const currentCost =
          (prevNode !== -1 ? matrix[prevNode][route[i]] : 0) +
          (nextNode !== -1 ? matrix[route[j]][nextNode] : 0);

        const newCost =
          (prevNode !== -1 ? matrix[prevNode][route[j]] : 0) +
          (nextNode !== -1 ? matrix[route[i]][nextNode] : 0);

        if (newCost < currentCost - 1e-6) {
          // Odwrócenie podciągu od i do j
          const sub = route.slice(i, j + 1).reverse();
          route = [...route.slice(0, i), ...sub, ...route.slice(j + 1)];
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  const distance = calculatePathDistance(route, matrix);
  const timeMs = Math.max(1, Date.now() - start);

  return { route, distance, iterations, timeMs };
};

/**
 * 3. Symulowane Wyżarzanie (Simulated Annealing)
 * Metaheurystyka probabilistyczna pozwalająca na ucieczkę z minimów lokalnych.
 * Prawdopodobieństwo akceptacji gorszego rozwiązania: P = exp(-ΔE / T).
 */
export const solveSimulatedAnnealingTSP = (
  initialRoute: number[],
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  const start = Date.now();
  let currentRoute = [...initialRoute];
  let bestRoute = [...initialRoute];
  let currentDist = calculatePathDistance(currentRoute, matrix);
  let bestDist = currentDist;

  const n = currentRoute.length;
  if (n <= 2) {
    return { route: bestRoute, distance: bestDist, iterations: 1, timeMs: 0 };
  }

  let temp = 100.0;
  const coolingRate = 0.98;
  const minTemp = 0.01;
  let iterations = 0;
  const startIndex = fixStart ? 1 : 0;

  while (temp > minTemp && iterations < 1500) {
    iterations++;

    // Losowy ruch 2-opt
    const i = startIndex + Math.floor(Math.random() * (n - startIndex - 1));
    const j = i + 1 + Math.floor(Math.random() * (n - i - 1));

    const candidateRoute = [
      ...currentRoute.slice(0, i),
      ...currentRoute.slice(i, j + 1).reverse(),
      ...currentRoute.slice(j + 1),
    ];

    const candidateDist = calculatePathDistance(candidateRoute, matrix);
    const delta = candidateDist - currentDist;

    if (delta < 0 || Math.exp(-delta / temp) > Math.random()) {
      currentRoute = candidateRoute;
      currentDist = candidateDist;

      if (currentDist < bestDist) {
        bestRoute = [...currentRoute];
        bestDist = currentDist;
      }
    }

    temp *= coolingRate;
  }

  const timeMs = Math.max(1, Date.now() - start);

  return { route: bestRoute, distance: bestDist, iterations, timeMs };
};

/**
 * 4. Metoda Dokładna (Brute Force) dla N <= 8
 * Sprawdza wszystkie możliwe permutacje (N-1)!, dając gwarantowane globalne optimum.
 * Służy do weryfikacji i oceny błędu względnego heurystyk w pracy inżynierskiej.
 */
export const solveBruteForceTSP = (
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } | null => {
  const n = matrix.length;
  if (n > 8) return null; // Zbyt wysoka złożoność dla N > 8

  const start = Date.now();
  const indices: number[] = Array.from({ length: n }, (_, i) => i);
  let bestRoute: number[] = [...indices];
  let bestDist = Infinity;
  let iterations = 0;

  const permute = (arr: number[], m: number) => {
    if (m === arr.length) {
      iterations++;
      const dist = calculatePathDistance(arr, matrix);
      if (dist < bestDist) {
        bestDist = dist;
        bestRoute = [...arr];
      }
      return;
    }
    for (let i = m; i < arr.length; i++) {
      [arr[m], arr[i]] = [arr[i], arr[m]];
      permute(arr, m + 1);
      [arr[m], arr[i]] = [arr[i], arr[m]];
    }
  };

  if (fixStart) {
    const sub = indices.slice(1);
    const permuteSub = (arr: number[], m: number) => {
      if (m === arr.length) {
        iterations++;
        const candidate = [0, ...arr];
        const dist = calculatePathDistance(candidate, matrix);
        if (dist < bestDist) {
          bestDist = dist;
          bestRoute = candidate;
        }
        return;
      }
      for (let i = m; i < arr.length; i++) {
        [arr[m], arr[i]] = [arr[i], arr[m]];
        permuteSub(arr, m + 1);
        [arr[m], arr[i]] = [arr[i], arr[m]];
      }
    };
    permuteSub(sub, 0);
  } else {
    permute(indices, 0);
  }

  const timeMs = Math.max(1, Date.now() - start);
  return { route: bestRoute, distance: bestDist, iterations, timeMs };
};

/**
 * Główna funkcja wykonująca pełną analizę i optymalizację trasy TSP.
 * Uruchamia wszystkie algorytmy, tworzy tabelę benchmarków i wybiera najlepszą trasę.
 */
export const optimizeSightseeingRoute = (
  points: GeoPoint[],
  fixStartPoint: boolean = false
): OptimizationResult => {
  if (points.length < 2) {
    const d = 0;
    return {
      orderedPoints: [...points],
      originalDistanceKm: 0,
      optimizedDistanceKm: 0,
      savingsKm: 0,
      savingsPercent: 0,
      timeSavedMinutes: 0,
      bestAlgorithm: {
        algorithmId: 'greedy',
        name: 'Trasa bazowa',
        distanceKm: 0,
        timeMs: 0,
        iterations: 0,
        routeIndices: points.map((_, i) => i),
      },
      benchmarks: [],
    };
  }

  const matrix = buildDistanceMatrix(points);
  const initialRoute = points.map((_, idx) => idx);
  const originalDistance = calculatePathDistance(initialRoute, matrix);

  const benchmarks: AlgorithmBenchmark[] = [];

  // 1. Algorytm Zachłanny (Nearest Neighbor)
  let greedyRes = solveGreedyTSP(matrix, 0);
  if (!fixStartPoint) {
    for (let s = 1; s < points.length; s++) {
      const cand = solveGreedyTSP(matrix, s);
      if (cand.distance < greedyRes.distance) {
        greedyRes = cand;
      }
    }
  }
  benchmarks.push({
    algorithmId: 'greedy',
    name: 'Algorytm Zachłanny (Nearest Neighbor)',
    distanceKm: Number(greedyRes.distance.toFixed(2)),
    timeMs: greedyRes.timeMs,
    iterations: greedyRes.iterations,
    routeIndices: greedyRes.route,
  });

  // 2. Przeszukiwanie Lokalne (2-Opt) - startujemy z trasy zachłannej dla szybszej zbieżności
  const twoOptRes = solveTwoOptTSP(greedyRes.route, matrix, fixStartPoint);
  benchmarks.push({
    algorithmId: '2opt',
    name: 'Przeszukiwanie Lokalne (2-Opt)',
    distanceKm: Number(twoOptRes.distance.toFixed(2)),
    timeMs: twoOptRes.timeMs,
    iterations: twoOptRes.iterations,
    routeIndices: twoOptRes.route,
  });

  // 3. Symulowane Wyżarzanie (Simulated Annealing)
  const saRes = solveSimulatedAnnealingTSP(initialRoute, matrix, fixStartPoint);
  benchmarks.push({
    algorithmId: 'simulated_annealing',
    name: 'Symulowane Wyżarzanie (Simulated Annealing)',
    distanceKm: Number(saRes.distance.toFixed(2)),
    timeMs: saRes.timeMs,
    iterations: saRes.iterations,
    routeIndices: saRes.route,
  });

  // 4. Metoda Dokładna (Brute Force) - tylko jeśli N <= 8
  if (points.length <= 8) {
    const bfRes = solveBruteForceTSP(matrix, fixStartPoint);
    if (bfRes) {
      benchmarks.push({
        algorithmId: 'brute_force',
        name: 'Metoda Dokładna (Globalne Optimum)',
        distanceKm: Number(bfRes.distance.toFixed(2)),
        timeMs: bfRes.timeMs,
        iterations: bfRes.iterations,
        routeIndices: bfRes.route,
      });
    }
  }

  // Wybieramy najlepszy uzyskany wynik
  let best = benchmarks[0];
  for (const b of benchmarks) {
    if (b.distanceKm < best.distanceKm) {
      best = b;
    }
  }

  // Jeśli żadna heurystyka nie pobiła trasy początkowej
  const finalDistance = Math.min(originalDistance, best.distanceKm);
  const bestRouteIndices =
    best.distanceKm <= originalDistance ? best.routeIndices : initialRoute;

  const savingsKm = Math.max(0, originalDistance - finalDistance);
  const savingsPercent =
    originalDistance > 0 ? (savingsKm / originalDistance) * 100 : 0;

  // Szacowany czas zaoszczędzony w ruchu miejskim (przyjmując śr. prędkość 12 km/h z korkami/chodzeniem)
  const timeSavedMinutes = Math.round((savingsKm / 12) * 60);

  const orderedPoints = bestRouteIndices.map((idx) => points[idx]);

  return {
    orderedPoints,
    originalDistanceKm: Number(originalDistance.toFixed(2)),
    optimizedDistanceKm: Number(finalDistance.toFixed(2)),
    savingsKm: Number(savingsKm.toFixed(2)),
    savingsPercent: Number(savingsPercent.toFixed(1)),
    timeSavedMinutes,
    bestAlgorithm: best,
    benchmarks,
  };
};

/**
 * Przypisuje optymalne godziny zwiedzania dla uszeregowanych punktów.
 * Rozpoczyna od godziny startowej (domyślnie 09:30 lub 10:00),
 * dodając czas zwiedzania (1.5 - 2h) oraz szacowany czas dojazdu.
 */
export const recalculateItineraryTimes = <
  T extends {
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    dateStr: string;
    timeStr?: string;
    parsedDate: Date;
    [key: string]: any;
  }
>(
  events: Array<T>,
  startHour: number = 10,
  startMinute: number = 0,
  legTransitMinutes: number[] = []
): Array<T & { timeStr: string }> => {
  let currentMinutes = startHour * 60 + startMinute;

  return events.map((event, index) => {
    // Zachowujemy godziny odjazdów i powrotów, jeśli to punkty skrajne
    if (event.type === 'DEPARTURE' && index === 0) {
      return { ...event, timeStr: event.timeStr || '08:00' };
    }
    if (event.type === 'RETURN' && index === events.length - 1) {
      return { ...event, timeStr: event.timeStr || '12:00' };
    }

    const hours = Math.floor(currentMinutes / 60) % 24;
    const mins = currentMinutes % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    // Czas zwiedzania (90 min) + realny czas przemieszczenia do kolejnego punktu (domyślnie 20 min)
    const transitTime = legTransitMinutes[index] !== undefined ? legTransitMinutes[index] : 20;
    currentMinutes += 90 + transitTime;

    return {
      ...event,
      timeStr,
    };
  });
};

// Bazowe współrzędne miast europejskich i światowych (fallback)
export const CITY_COORDINATES: { [key: string]: { lat: number; lon: number } } = {
  // Włochy
  rzym: { lat: 41.9028, lon: 12.4964 },
  rome: { lat: 41.9028, lon: 12.4964 },
  mediolan: { lat: 45.4642, lon: 9.1900 },
  milan: { lat: 45.4642, lon: 9.1900 },
  wenecja: { lat: 45.4408, lon: 12.3155 },
  venice: { lat: 45.4408, lon: 12.3155 },
  florencja: { lat: 43.7696, lon: 11.2558 },
  florence: { lat: 43.7696, lon: 11.2558 },
  neapol: { lat: 40.8518, lon: 14.2681 },
  naples: { lat: 40.8518, lon: 14.2681 },
  bari: { lat: 41.1171, lon: 16.8719 },
  bolonia: { lat: 44.4949, lon: 11.3426 },
  bologna: { lat: 44.4949, lon: 11.3426 },
  alghero: { lat: 40.5579, lon: 8.3193 },
  matera: { lat: 40.6664, lon: 16.6043 },
  palermo: { lat: 38.1157, lon: 13.3615 },
  // Hiszpania
  barcelona: { lat: 41.3851, lon: 2.1734 },
  madryt: { lat: 40.4168, lon: -3.7038 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  walencja: { lat: 39.4699, lon: -0.3763 },
  valencia: { lat: 39.4699, lon: -0.3763 },
  sewilla: { lat: 37.3891, lon: -5.9845 },
  seville: { lat: 37.3891, lon: -5.9845 },
  'san sebastian': { lat: 43.3183, lon: -1.9812 },
  'san sebastián': { lat: 43.3183, lon: -1.9812 },
  girona: { lat: 41.9794, lon: 2.8214 },
  // Francja
  paryż: { lat: 48.8566, lon: 2.3522 },
  paris: { lat: 48.8566, lon: 2.3522 },
  nicea: { lat: 43.7102, lon: 7.2620 },
  nice: { lat: 43.7102, lon: 7.2620 },
  colmar: { lat: 48.0794, lon: 7.3585 },
  // Wielka Brytania & Irlandia
  londyn: { lat: 51.5074, lon: -0.1278 },
  london: { lat: 51.5074, lon: -0.1278 },
  edynburg: { lat: 55.9533, lon: -3.1883 },
  edinburgh: { lat: 55.9533, lon: -3.1883 },
  dublin: { lat: 53.3498, lon: -6.2603 },
  // Portugalia
  lizbona: { lat: 38.7223, lon: -9.1393 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  porto: { lat: 41.1579, lon: -8.6291 },
  sintra: { lat: 38.8029, lon: -9.3817 },
  // Niemcy, Austria, Szwajcaria
  berlin: { lat: 52.5200, lon: 13.4050 },
  monachium: { lat: 48.1351, lon: 11.5820 },
  munich: { lat: 48.1351, lon: 11.5820 },
  wiedeń: { lat: 48.2082, lon: 16.3738 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  salzburg: { lat: 47.8095, lon: 13.0550 },
  hallstatt: { lat: 47.5622, lon: 13.6493 },
  zurych: { lat: 47.3769, lon: 8.5417 },
  zurich: { lat: 47.3769, lon: 8.5417 },
  // Polska
  warszawa: { lat: 52.2297, lon: 21.0122 },
  warsaw: { lat: 52.2297, lon: 21.0122 },
  kraków: { lat: 50.0647, lon: 19.9450 },
  krakow: { lat: 50.0647, lon: 19.9450 },
  gdańsk: { lat: 54.3520, lon: 18.6466 },
  gdansk: { lat: 54.3520, lon: 18.6466 },
  wrocław: { lat: 51.1079, lon: 17.0385 },
  wroclaw: { lat: 51.1079, lon: 17.0385 },
  poznań: { lat: 52.4064, lon: 16.9252 },
  poznan: { lat: 52.4064, lon: 16.9252 },
  toruń: { lat: 53.0138, lon: 18.5984 },
  torun: { lat: 53.0138, lon: 18.5984 },
  zakopane: { lat: 49.2992, lon: 19.9496 },
  sandomierz: { lat: 50.6800, lon: 21.7500 },
  szczawnica: { lat: 49.4278, lon: 20.4856 },
  katowice: { lat: 50.2649, lon: 19.0238 },
  łódź: { lat: 51.7592, lon: 19.4560 },
  lodz: { lat: 51.7592, lon: 19.4560 },
  lublin: { lat: 51.2465, lon: 22.5684 },
  szczecin: { lat: 53.4285, lon: 14.5528 },
  gdynia: { lat: 54.5189, lon: 18.5305 },
  sopot: { lat: 54.4418, lon: 18.5601 },
  // Europa Środkowa i Północna
  praga: { lat: 50.0755, lon: 14.4378 },
  prague: { lat: 50.0755, lon: 14.4378 },
  brno: { lat: 49.1951, lon: 16.6068 },
  budapeszt: { lat: 47.4979, lon: 19.0402 },
  budapest: { lat: 47.4979, lon: 19.0402 },
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  kopenhaga: { lat: 55.6761, lon: 12.5683 },
  copenhagen: { lat: 55.6761, lon: 12.5683 },
  reykjavik: { lat: 64.1466, lon: -21.9426 },
  bergen: { lat: 60.3913, lon: 5.3221 },
  tromso: { lat: 69.6492, lon: 18.9553 },
  tromsø: { lat: 69.6492, lon: 18.9553 },
  tallinn: { lat: 59.4370, lon: 24.7536 },
  // Bałkany i Południe
  dubrownik: { lat: 42.6507, lon: 18.0944 },
  dubrovnik: { lat: 42.6507, lon: 18.0944 },
  zadar: { lat: 44.1194, lon: 15.2314 },
  kotor: { lat: 42.4247, lon: 18.7712 },
  lublana: { lat: 46.0569, lon: 14.5058 },
  ljubljana: { lat: 46.0569, lon: 14.5058 },
  ochryda: { lat: 41.1172, lon: 20.8016 },
  ohrid: { lat: 41.1172, lon: 20.8016 },
  ateny: { lat: 37.9838, lon: 23.7275 },
  athens: { lat: 37.9838, lon: 23.7275 },
  stambuł: { lat: 41.0082, lon: 28.9784 },
  istanbul: { lat: 41.0082, lon: 28.9784 },
  valletta: { lat: 35.8992, lon: 14.5141 },
  // Świat
  tokio: { lat: 35.6762, lon: 139.6503 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  'nowy jork': { lat: 40.7128, lon: -74.0060 },
  'new york': { lat: 40.7128, lon: -74.0060 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  dubaj: { lat: 25.2048, lon: 55.2708 },
  dubai: { lat: 25.2048, lon: 55.2708 },
  singapur: { lat: 1.3521, lon: 103.8198 },
  singapore: { lat: 1.3521, lon: 103.8198 },
  sydney: { lat: -33.8688, lon: 151.2093 },
};

// Znane współrzędne lotnisk dla kluczowych kierunków turystycznych
export const KNOWN_AIRPORTS_COORDINATES: Record<string, { lat: number; lon: number }> = {
  barcelona: { lat: 41.2983, lon: 2.0800 },
  madryt: { lat: 40.4839, lon: -3.5680 },
  madrid: { lat: 40.4839, lon: -3.5680 },
  sevilla: { lat: 37.4180, lon: -5.8931 },
  seville: { lat: 37.4180, lon: -5.8931 },
  sewilla: { lat: 37.4180, lon: -5.8931 },
  valencia: { lat: 39.4893, lon: -0.4816 },
  walencja: { lat: 39.4893, lon: -0.4816 },
  malaga: { lat: 36.6749, lon: -4.4991 },
  málaga: { lat: 36.6749, lon: -4.4991 },
  girona: { lat: 41.9009, lon: 2.7606 },
  rome: { lat: 41.7999, lon: 12.2462 },
  rzym: { lat: 41.7999, lon: 12.2462 },
  milan: { lat: 45.6301, lon: 8.7255 },
  mediolan: { lat: 45.6301, lon: 8.7255 },
  venice: { lat: 45.5053, lon: 12.3519 },
  wenecja: { lat: 45.5053, lon: 12.3519 },
  florence: { lat: 43.8100, lon: 11.2051 },
  florencja: { lat: 43.8100, lon: 11.2051 },
  naples: { lat: 40.8860, lon: 14.2908 },
  neapol: { lat: 40.8860, lon: 14.2908 },
  paris: { lat: 49.0097, lon: 2.5479 },
  paryz: { lat: 49.0097, lon: 2.5479 },
  paryż: { lat: 49.0097, lon: 2.5479 },
  nice: { lat: 43.6653, lon: 7.2150 },
  nicea: { lat: 43.6653, lon: 7.2150 },
  london: { lat: 51.4700, lon: -0.4543 },
  londyn: { lat: 51.4700, lon: -0.4543 },
  edinburgh: { lat: 55.9508, lon: -3.3725 },
  edynburg: { lat: 55.9508, lon: -3.3725 },
  berlin: { lat: 52.3667, lon: 13.5033 },
  munich: { lat: 48.3537, lon: 11.7750 },
  monachium: { lat: 48.3537, lon: 11.7750 },
  vienna: { lat: 48.1103, lon: 16.5697 },
  wieden: { lat: 48.1103, lon: 16.5697 },
  wiedeń: { lat: 48.1103, lon: 16.5697 },
  amsterdam: { lat: 52.3105, lon: 4.7683 },
  prague: { lat: 50.1008, lon: 14.2600 },
  praga: { lat: 50.1008, lon: 14.2600 },
  lisbon: { lat: 38.7756, lon: -9.1354 },
  lizbona: { lat: 38.7756, lon: -9.1354 },
  porto: { lat: 41.2421, lon: -8.6786 },
  athens: { lat: 37.9356, lon: 23.9484 },
  ateny: { lat: 37.9356, lon: 23.9484 },
  warsaw: { lat: 52.1672, lon: 20.9679 },
  warszawa: { lat: 52.1672, lon: 20.9679 },
  krakow: { lat: 50.0777, lon: 19.7848 },
  kraków: { lat: 50.0777, lon: 19.7848 },
  gdansk: { lat: 54.3776, lon: 18.4662 },
  gdańsk: { lat: 54.3776, lon: 18.4662 },
  wroclaw: { lat: 51.1027, lon: 16.8858 },
  wrocław: { lat: 51.1027, lon: 16.8858 },
  tokyo: { lat: 35.5494, lon: 139.7798 },
  tokio: { lat: 35.5494, lon: 139.7798 },
  'new york': { lat: 40.6413, lon: -73.7781 },
  'nowy jork': { lat: 40.6413, lon: -73.7781 },
};

// Znane współrzędne głównych dworców kolejowych
export const KNOWN_STATIONS_COORDINATES: Record<string, { lat: number; lon: number }> = {
  barcelona: { lat: 41.3790, lon: 2.1400 },
  madrid: { lat: 40.4065, lon: -3.6908 },
  madryt: { lat: 40.4065, lon: -3.6908 },
  rome: { lat: 41.9010, lon: 12.5019 },
  rzym: { lat: 41.9010, lon: 12.5019 },
  paris: { lat: 48.8809, lon: 2.3553 },
  paryz: { lat: 48.8809, lon: 2.3553 },
  paryż: { lat: 48.8809, lon: 2.3553 },
  london: { lat: 51.5314, lon: -0.1261 },
  londyn: { lat: 51.5314, lon: -0.1261 },
  berlin: { lat: 52.5251, lon: 13.3694 },
  amsterdam: { lat: 52.3791, lon: 4.9003 },
  vienna: { lat: 48.1851, lon: 16.3770 },
  wieden: { lat: 48.1851, lon: 16.3770 },
  wiedeń: { lat: 48.1851, lon: 16.3770 },
  prague: { lat: 50.0831, lon: 14.4352 },
  praga: { lat: 50.0831, lon: 14.4352 },
  warsaw: { lat: 52.2288, lon: 21.0032 },
  warszawa: { lat: 52.2288, lon: 21.0032 },
  krakow: { lat: 50.0664, lon: 19.9474 },
  kraków: { lat: 50.0664, lon: 19.9474 },
};

// Znane współrzędne popularnych zabytków
export const KNOWN_ATTRACTIONS_COORDINATES: { [key: string]: { lat: number; lon: number } } = {
  // Rzym
  koloseum: { lat: 41.8902, lon: 12.4922 },
  colosseum: { lat: 41.8902, lon: 12.4922 },
  panteon: { lat: 41.8986, lon: 12.4769 },
  pantheon: { lat: 41.8986, lon: 12.4769 },
  'fontanna di trevi': { lat: 41.9009, lon: 12.4833 },
  'trevi fountain': { lat: 41.9009, lon: 12.4833 },
  watykan: { lat: 41.9022, lon: 12.4539 },
  vatican: { lat: 41.9022, lon: 12.4539 },
  'muzea watykańskie': { lat: 41.9065, lon: 12.4536 },
  'vatican museums': { lat: 41.9065, lon: 12.4536 },
  'bazylika św. piotra': { lat: 41.9022, lon: 12.4539 },
  "st. peter's basilica": { lat: 41.9022, lon: 12.4539 },
  'schody hiszpańskie': { lat: 41.9060, lon: 12.4828 },
  'spanish steps': { lat: 41.9060, lon: 12.4828 },
  'forum romanum': { lat: 41.8925, lon: 12.4853 },
  'roman forum': { lat: 41.8925, lon: 12.4853 },
  'zamek świętego anioła': { lat: 41.9031, lon: 12.4663 },
  'castel sant angelo': { lat: 41.9031, lon: 12.4663 },
  'piazza navona': { lat: 41.8992, lon: 12.4731 },
  'villa borghese': { lat: 41.9142, lon: 12.4922 },
  trastevere: { lat: 41.8893, lon: 12.4700 },
  kapitol: { lat: 41.8933, lon: 12.4831 },
  // Paryż
  'wieża eiffla': { lat: 48.8584, lon: 2.2945 },
  'eiffel tower': { lat: 48.8584, lon: 2.2945 },
  luwr: { lat: 48.8606, lon: 2.3376 },
  louvre: { lat: 48.8606, lon: 2.3376 },
  'katedra notre dame': { lat: 48.8530, lon: 2.3499 },
  'notre dame': { lat: 48.8530, lon: 2.3499 },
  'łuk triumfalny': { lat: 48.8738, lon: 2.2950 },
  'arc de triomphe': { lat: 48.8738, lon: 2.2950 },
  'sacre-coeur': { lat: 48.8867, lon: 2.3431 },
  montmartre: { lat: 48.8867, lon: 2.3431 },
  'champs-elysees': { lat: 48.8698, lon: 2.3075 },
  'musee d orsay': { lat: 48.8600, lon: 2.3266 },
  // Barcelona (pełna baza zabytków, nazwy hiszpańskie, katalońskie i międzynarodowe)
  'sagrada familia': { lat: 41.4036, lon: 2.1744 },
  'basilica de la sagrada familia': { lat: 41.4036, lon: 2.1744 },
  'basilica sagrada familia': { lat: 41.4036, lon: 2.1744 },
  'temple de la sagrada familia': { lat: 41.4036, lon: 2.1744 },
  'la pedrera': { lat: 41.3953, lon: 2.1618 },
  'casa mila': { lat: 41.3953, lon: 2.1618 },
  'casa milà': { lat: 41.3953, lon: 2.1618 },
  'la pedrera - casa mila': { lat: 41.3953, lon: 2.1618 },
  'la pedrera - casa milà': { lat: 41.3953, lon: 2.1618 },
  'casa mila - la pedrera': { lat: 41.3953, lon: 2.1618 },
  'casa batllo': { lat: 41.3917, lon: 2.1649 },
  'casa batlló': { lat: 41.3917, lon: 2.1649 },
  'park guell': { lat: 41.4145, lon: 2.1527 },
  'park güell': { lat: 41.4145, lon: 2.1527 },
  'parc guell': { lat: 41.4145, lon: 2.1527 },
  'parc güell': { lat: 41.4145, lon: 2.1527 },
  'la rambla': { lat: 41.3818, lon: 2.1731 },
  'las ramblas': { lat: 41.3818, lon: 2.1731 },
  barceloneta: { lat: 41.3784, lon: 2.1925 },
  'platja de la barceloneta': { lat: 41.3784, lon: 2.1925 },
  'playa barceloneta': { lat: 41.3784, lon: 2.1925 },
  'camp nou': { lat: 41.3809, lon: 2.1228 },
  'spotify camp nou': { lat: 41.3809, lon: 2.1228 },
  'estadi camp nou': { lat: 41.3809, lon: 2.1228 },
  'montjuic': { lat: 41.3634, lon: 2.1652 },
  'montjuïc': { lat: 41.3634, lon: 2.1652 },
  'castell de montjuic': { lat: 41.3630, lon: 2.1660 },
  'castell de montjuïc': { lat: 41.3630, lon: 2.1660 },
  'zamek montjuic': { lat: 41.3630, lon: 2.1660 },
  'katedra św. eulalii': { lat: 41.3840, lon: 2.1762 },
  'katedra sw eulalii': { lat: 41.3840, lon: 2.1762 },
  'catedral de barcelona': { lat: 41.3840, lon: 2.1762 },
  'katedra w barcelonie': { lat: 41.3840, lon: 2.1762 },
  'barri gotic': { lat: 41.3828, lon: 2.1770 },
  'barrio gotico': { lat: 41.3828, lon: 2.1770 },
  'dzielnica gotycka': { lat: 41.3828, lon: 2.1770 },
  'mercado de la boqueria': { lat: 41.3817, lon: 2.1715 },
  'mercat de la boqueria': { lat: 41.3817, lon: 2.1715 },
  'la boqueria': { lat: 41.3817, lon: 2.1715 },
  boqueria: { lat: 41.3817, lon: 2.1715 },
  'arc de triomf': { lat: 41.3911, lon: 2.1806 },
  'luk triumfalny w barcelonie': { lat: 41.3911, lon: 2.1806 },
  'parc de la ciutadella': { lat: 41.3880, lon: 2.1874 },
  'park ciutadella': { lat: 41.3880, lon: 2.1874 },
  'muzeum picassa': { lat: 41.3853, lon: 2.1809 },
  'museu picasso': { lat: 41.3853, lon: 2.1809 },
  'tibidabo': { lat: 41.4225, lon: 2.1186 },
  'parc d atraccions tibidabo': { lat: 41.4225, lon: 2.1186 },
  'temple del sagrat cor': { lat: 41.4225, lon: 2.1186 },
  'placa de catalunya': { lat: 41.3870, lon: 2.1700 },
  'placa catalunya': { lat: 41.3870, lon: 2.1700 },
  'plac katalonski': { lat: 41.3870, lon: 2.1700 },
  'placa d espanya': { lat: 41.3750, lon: 2.1491 },
  'placa espanya': { lat: 41.3750, lon: 2.1491 },
  'plac hiszpanski': { lat: 41.3750, lon: 2.1491 },
  'palau guell': { lat: 41.3789, lon: 2.1742 },
  'palau güell': { lat: 41.3789, lon: 2.1742 },
  'hospital de sant pau': { lat: 41.4116, lon: 2.1745 },
  'sant pau': { lat: 41.4116, lon: 2.1745 },
  'poble espanyol': { lat: 41.3688, lon: 2.1488 },
  'font magica': { lat: 41.3712, lon: 2.1517 },
  'magiczna fontanna': { lat: 41.3712, lon: 2.1517 },
  'port vell': { lat: 41.3768, lon: 2.1834 },
  'port olimpic': { lat: 41.3861, lon: 2.1969 },
  'casa vicens': { lat: 41.4035, lon: 2.1506 },
  'bunkers del carmel': { lat: 41.4193, lon: 2.1617 },
  'mnac': { lat: 41.3686, lon: 2.1539 },
  'museu nacional d art de catalunya': { lat: 41.3686, lon: 2.1539 },
  'palau de la musica catalana': { lat: 41.3876, lon: 2.1753 },
  'palau de la musica': { lat: 41.3876, lon: 2.1753 },
  'placa reial': { lat: 41.3800, lon: 2.1750 },
  'plaza real': { lat: 41.3800, lon: 2.1750 },
  'torre glories': { lat: 41.4035, lon: 2.1895 },
  'torre agbar': { lat: 41.4035, lon: 2.1895 },
  // Lotniska i dworce w Barcelonie
  'airport barcelona': { lat: 41.2983, lon: 2.0800 },
  'lotnisko barcelona': { lat: 41.2983, lon: 2.0800 },
  'barcelona airport': { lat: 41.2983, lon: 2.0800 },
  'aeropuerto barcelona': { lat: 41.2983, lon: 2.0800 },
  'aeroport barcelona': { lat: 41.2983, lon: 2.0800 },
  'aeroport de barcelona el prat': { lat: 41.2983, lon: 2.0800 },
  'aeropuerto josep tarradellas barcelona el prat': { lat: 41.2983, lon: 2.0800 },
  'lotnisko el prat': { lat: 41.2983, lon: 2.0800 },
  'aeroport el prat': { lat: 41.2983, lon: 2.0800 },
  'el prat': { lat: 41.2983, lon: 2.0800 },
  'estacio de sants': { lat: 41.3790, lon: 2.1400 },
  'barcelona sants': { lat: 41.3790, lon: 2.1400 },
  'dworzec barcelona sants': { lat: 41.3790, lon: 2.1400 },
  'central station barcelona': { lat: 41.3790, lon: 2.1400 },
  'sants': { lat: 41.3790, lon: 2.1400 },
  // Lotniska i dworce w Rzymie
  'airport rome': { lat: 41.7999, lon: 12.2462 },
  'lotnisko rzym': { lat: 41.7999, lon: 12.2462 },
  'rome airport': { lat: 41.7999, lon: 12.2462 },
  fiumicino: { lat: 41.7999, lon: 12.2462 },
  'aeroporto di fiumicino': { lat: 41.7999, lon: 12.2462 },
  ciampino: { lat: 41.7994, lon: 12.5949 },
  'roma termini': { lat: 41.9010, lon: 12.5019 },
  'stazione termini': { lat: 41.9010, lon: 12.5019 },
  'central station rome': { lat: 41.9010, lon: 12.5019 },
  // Lotniska i dworce w Paryżu
  'airport paris': { lat: 49.0097, lon: 2.5479 },
  'lotnisko paryz': { lat: 49.0097, lon: 2.5479 },
  'paris airport': { lat: 49.0097, lon: 2.5479 },
  'charles de gaulle': { lat: 49.0097, lon: 2.5479 },
  cdg: { lat: 49.0097, lon: 2.5479 },
  orly: { lat: 48.7262, lon: 2.3652 },
  'gare du nord': { lat: 48.8809, lon: 2.3553 },
  'gare de lyon': { lat: 48.8448, lon: 2.3735 },
  'central station paris': { lat: 48.8809, lon: 2.3553 },
  // Lotniska i dworce w Londynie
  'airport london': { lat: 51.4700, lon: -0.4543 },
  'lotnisko londyn': { lat: 51.4700, lon: -0.4543 },
  'london airport': { lat: 51.4700, lon: -0.4543 },
  heathrow: { lat: 51.4700, lon: -0.4543 },
  gatwick: { lat: 51.1537, lon: -0.1821 },
  stansted: { lat: 51.8860, lon: 0.2389 },
  'st pancras': { lat: 51.5314, lon: -0.1261 },
  'king s cross': { lat: 51.5308, lon: -0.1238 },
  // Lotniska i dworce w Polsce
  'airport warsaw': { lat: 52.1672, lon: 20.9679 },
  'lotnisko warszawa': { lat: 52.1672, lon: 20.9679 },
  'lotnisko chopina': { lat: 52.1672, lon: 20.9679 },
  okecie: { lat: 52.1672, lon: 20.9679 },
  modlin: { lat: 52.4511, lon: 20.6518 },
  'warszawa centralna': { lat: 52.2288, lon: 21.0032 },
  'airport krakow': { lat: 50.0777, lon: 19.7848 },
  'lotnisko krakow': { lat: 50.0777, lon: 19.7848 },
  balice: { lat: 50.0777, lon: 19.7848 },
  'krakow glowny': { lat: 50.0664, lon: 19.9474 },
  'kraków główny': { lat: 50.0664, lon: 19.9474 },
  // Londyn
  'big ben': { lat: 51.5007, lon: -0.1246 },
  'london eye': { lat: 51.5033, lon: -0.1195 },
  'tower bridge': { lat: 51.5055, lon: -0.0754 },
  'british museum': { lat: 51.5194, lon: -0.1270 },
  // Kraków
  wawel: { lat: 50.0540, lon: 19.9354 },
  sukiennice: { lat: 50.0617, lon: 19.9373 },
  kazimierz: { lat: 50.0515, lon: 19.9452 },
  'kopiec kościuszki': { lat: 50.0549, lon: 19.8933 },
  // Warszawa
  'pałac kultury i nauki': { lat: 52.2319, lon: 21.0067 },
  'łazienki królewskie': { lat: 52.2150, lon: 21.0350 },
  'stare miasto': { lat: 52.2497, lon: 21.0122 },
  'muzeum powstania warszawskiego': { lat: 52.2323, lon: 20.9806 },
  // Wiedeń
  'pałac schonbrunn': { lat: 48.1858, lon: 16.3128 },
  'katedra św. szczepana': { lat: 48.2085, lon: 16.3732 },
  belweder: { lat: 48.1915, lon: 16.3808 },
  // Praga
  'most karola': { lat: 50.0865, lon: 14.4114 },
  'zamek praski': { lat: 50.0911, lon: 14.4016 },
  // Berlin
  'brama brandenburska': { lat: 52.5163, lon: 13.3777 },
  reichstag: { lat: 52.5186, lon: 13.3762 },
  alexanderplatz: { lat: 52.5219, lon: 13.4132 },
  // Włochy - Mediolan, Wenecja, Florencja
  duomo: { lat: 45.4641, lon: 9.1919 },
  'duomo di milano': { lat: 45.4641, lon: 9.1919 },
  'katedra w mediolanie': { lat: 45.4641, lon: 9.1919 },
  'castello sforzesco': { lat: 45.4705, lon: 9.1793 },
  'galeria vittorio emanuele': { lat: 45.4659, lon: 9.1899 },
  'piazza san marco': { lat: 45.4342, lon: 12.3385 },
  'plac sw marka': { lat: 45.4342, lon: 12.3385 },
  'plac św. marka': { lat: 45.4342, lon: 12.3385 },
  'bazylika sw marka': { lat: 45.4345, lon: 12.3397 },
  'most rialto': { lat: 45.4380, lon: 12.3359 },
  'ponte di rialto': { lat: 45.4380, lon: 12.3359 },
  'ponte vecchio': { lat: 43.7680, lon: 11.2531 },
  'galeria uffizi': { lat: 43.7677, lon: 11.2553 },
  'uffizi': { lat: 43.7677, lon: 11.2553 },
  // Polska - Gdańsk, Wrocław, Zakopane, Kraków, Warszawa
  żuraw: { lat: 54.3506, lon: 18.6575 },
  zuraw: { lat: 54.3506, lon: 18.6575 },
  'fontanna neptuna': { lat: 54.3485, lon: 18.6533 },
  'długi targ': { lat: 54.3486, lon: 18.6540 },
  'dlugi targ': { lat: 54.3486, lon: 18.6540 },
  'bazylika mariacka w gdańsku': { lat: 54.3498, lon: 18.6533 },
  westerplatte: { lat: 54.4069, lon: 18.6672 },
  'ostrow tumski': { lat: 51.1147, lon: 17.0450 },
  'ostrów tumski': { lat: 51.1147, lon: 17.0450 },
  'hala stulecia': { lat: 51.1069, lon: 17.0772 },
  'panorama racławicka': { lat: 51.1102, lon: 17.0443 },
  'panorama raclawicka': { lat: 51.1102, lon: 17.0443 },
  'kościół mariacki': { lat: 50.0616, lon: 19.9392 },
  'kosciol mariacki': { lat: 50.0616, lon: 19.9392 },
  'rynek główny': { lat: 50.0617, lon: 19.9373 },
  'rynek glowny': { lat: 50.0617, lon: 19.9373 },
  'zamek królewski w warszawie': { lat: 52.2480, lon: 21.0145 },
  'zamek krolewski': { lat: 52.2480, lon: 21.0145 },
  'krupówki': { lat: 49.2955, lon: 19.9547 },
  krupowki: { lat: 49.2955, lon: 19.9547 },
  'gubałówka': { lat: 49.3075, lon: 19.9355 },
  gubalowka: { lat: 49.3075, lon: 19.9355 },
  'morskie oko': { lat: 49.2007, lon: 20.0711 },
  // Lizbona
  'torre de belem': { lat: 38.6916, lon: -9.2160 },
  'klasztor hieronimitów': { lat: 38.6979, lon: -9.2067 },
  'praca do comercio': { lat: 38.7075, lon: -9.1364 },
  // Grecja - Ateny
  akropol: { lat: 37.9715, lon: 23.7257 },
  acropolis: { lat: 37.9715, lon: 23.7257 },
  partenon: { lat: 37.9715, lon: 23.7267 },
  // Świat - Tokio & Nowy Jork
  'tokyo tower': { lat: 35.6586, lon: 139.7454 },
  'shibuya crossing': { lat: 35.6595, lon: 139.7004 },
  'senso-ji': { lat: 35.7148, lon: 139.7967 },
  'sensoji': { lat: 35.7148, lon: 139.7967 },
  'tokyo skytree': { lat: 35.7101, lon: 139.8107 },
  'empire state building': { lat: 40.7484, lon: -73.9857 },
  'central park': { lat: 40.7829, lon: -73.9654 },
  'times square': { lat: 40.7580, lon: -73.9855 },
  'statua wolności': { lat: 40.6892, lon: -74.0445 },
  'statue of liberty': { lat: 40.6892, lon: -74.0445 },
};

export const normalizeAttractionTitle = (title: string): string => {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\-–—\.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const GEOCODE_CACHE = new Map<string, { lat: number; lon: number }>();

/**
 * Rozpoznaje i wyznacza współrzędne GPS dla dowolnego punktu trasy.
 * Działa w 100% offline bazując kolejno na przekazanych koordynatach,
 * danych z Google Places pool, słowniku znanych zabytków lub deterministycznym hashowaniu wokół centrum miasta.
 */
export const resolvePointCoordinates = (
  title: string,
  pool: Array<{ name?: string; lat?: number; lon?: number }> = [],
  destinationCity: string = 'Rome',
  lodgingCoords?: { lat: number; lon: number } | null,
  eventCoords?: { lat?: number; lon?: number } | null
): { lat: number; lon: number } => {
  // 0. Bezpośrednie współrzędne z obiektu wydarzenia
  if (
    eventCoords &&
    typeof eventCoords.lat === 'number' &&
    typeof eventCoords.lon === 'number' &&
    !isNaN(eventCoords.lat) &&
    !isNaN(eventCoords.lon)
  ) {
    return { lat: eventCoords.lat, lon: eventCoords.lon };
  }

  const cleanTitle = normalizeAttractionTitle(title);
  const cacheKey = `${cleanTitle}_${normalizeAttractionTitle(destinationCity)}`;
  if (GEOCODE_CACHE.has(cacheKey)) {
    return GEOCODE_CACHE.get(cacheKey)!;
  }

  // 1. Sprawdzamy czy w pool z bazy danych jest obiekt ze współrzędnymi
  const foundInPool = pool.find((p) => {
    if (!p.name || !p.lat || !p.lon) return false;
    const cleanPoolName = normalizeAttractionTitle(p.name);
    return cleanPoolName === cleanTitle || cleanTitle.includes(cleanPoolName) || cleanPoolName.includes(cleanTitle);
  });
  if (foundInPool && foundInPool.lat && foundInPool.lon) {
    GEOCODE_CACHE.set(cacheKey, { lat: foundInPool.lat, lon: foundInPool.lon });
    return { lat: foundInPool.lat, lon: foundInPool.lon };
  }

  // 2. Sprawdzamy słownik znanych atrakcji z pełną normalizacją
  for (const [key, coords] of Object.entries(KNOWN_ATTRACTIONS_COORDINATES)) {
    const cleanKey = normalizeAttractionTitle(key);
    if (cleanTitle.includes(cleanKey) || cleanKey.includes(cleanTitle)) {
      GEOCODE_CACHE.set(cacheKey, coords);
      return coords;
    }
  }

  // 3. Sprawdzamy czy to lotnisko lub dworzec
  const normDest = normalizeAttractionTitle(destinationCity || '');
  if (
    cleanTitle.includes('airport') ||
    cleanTitle.includes('lotnisk') ||
    cleanTitle.includes('aeroport') ||
    cleanTitle.includes('aeropuert')
  ) {
    for (const [cityKey, coords] of Object.entries(KNOWN_AIRPORTS_COORDINATES)) {
      const cleanCityKey = normalizeAttractionTitle(cityKey);
      if (normDest.includes(cleanCityKey) || cleanCityKey.includes(normDest) || cleanTitle.includes(cleanCityKey)) {
        GEOCODE_CACHE.set(cacheKey, coords);
        return coords;
      }
    }
  }

  if (
    cleanTitle.includes('station') ||
    cleanTitle.includes('dworzec') ||
    cleanTitle.includes('stacja') ||
    cleanTitle.includes('gare') ||
    cleanTitle.includes('stazione')
  ) {
    for (const [cityKey, coords] of Object.entries(KNOWN_STATIONS_COORDINATES)) {
      const cleanCityKey = normalizeAttractionTitle(cityKey);
      if (normDest.includes(cleanCityKey) || cleanCityKey.includes(normDest) || cleanTitle.includes(cleanCityKey)) {
        GEOCODE_CACHE.set(cacheKey, coords);
        return coords;
      }
    }
  }

  // 4. Jeśli to nocleg i przekazano lodgingCoords
  if (
    lodgingCoords &&
    (cleanTitle.includes('hotel') ||
      cleanTitle.includes('lodging') ||
      cleanTitle.includes('zameldowanie') ||
      cleanTitle.includes('check in'))
  ) {
    return lodgingCoords;
  }

  // 5. Sprawdzamy współrzędne miasta docelowego
  let baseCoords = lodgingCoords || null;
  if (!baseCoords) {
    for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
      const cleanCityKey = normalizeAttractionTitle(key);
      if (normDest.includes(cleanCityKey) || cleanCityKey.includes(normDest)) {
        baseCoords = coords;
        break;
      }
    }
  }
  if (!baseCoords) {
    baseCoords = { lat: 41.9028, lon: 12.4964 }; // Domyślnie Rzym
  }

  // UWAGA: Nigdy nie zapisujemy baseCoords do GEOCODE_CACHE, aby nie zatruwać
  // pamięci podręcznej i umożliwić asynchroniczne pobranie prawdziwych koordynatów z Google Places!
  return baseCoords;
};

/**
 * Asynchronicznie dociąga dokładne współrzędne GPS punktu trasy z Google Places API na żywo.
 */
export const resolvePointCoordinatesAsync = async (
  title: string,
  pool: Array<{ name?: string; lat?: number; lon?: number }> = [],
  destinationCity: string = 'Rome',
  lodgingCoords?: { lat: number; lon: number } | null,
  eventCoords?: { lat?: number; lon?: number } | null
): Promise<{ lat: number; lon: number; isFallback?: boolean }> => {
  // 0. Bezpośrednie współrzędne z obiektu wydarzenia
  if (
    eventCoords &&
    typeof eventCoords.lat === 'number' &&
    typeof eventCoords.lon === 'number' &&
    !isNaN(eventCoords.lat) &&
    !isNaN(eventCoords.lon)
  ) {
    return { lat: eventCoords.lat, lon: eventCoords.lon, isFallback: false };
  }

  const cleanTitle = normalizeAttractionTitle(title);
  const cacheKey = `${cleanTitle}_${normalizeAttractionTitle(destinationCity)}`;
  if (GEOCODE_CACHE.has(cacheKey)) {
    const cached = GEOCODE_CACHE.get(cacheKey)!;
    return { ...cached, isFallback: false };
  }

  // 1. Sprawdzamy czy w pool z bazy danych jest obiekt ze współrzędnymi
  const foundInPool = pool.find((p) => {
    if (!p.name || !p.lat || !p.lon) return false;
    const cleanPoolName = normalizeAttractionTitle(p.name);
    return cleanPoolName === cleanTitle || cleanTitle.includes(cleanPoolName) || cleanPoolName.includes(cleanTitle);
  });
  if (foundInPool && foundInPool.lat && foundInPool.lon) {
    GEOCODE_CACHE.set(cacheKey, { lat: foundInPool.lat, lon: foundInPool.lon });
    return { lat: foundInPool.lat, lon: foundInPool.lon, isFallback: false };
  }

  // 2. Sprawdzamy słownik znanych atrakcji z pełną normalizacją
  for (const [key, coords] of Object.entries(KNOWN_ATTRACTIONS_COORDINATES)) {
    const cleanKey = normalizeAttractionTitle(key);
    if (cleanTitle.includes(cleanKey) || cleanKey.includes(cleanTitle)) {
      GEOCODE_CACHE.set(cacheKey, coords);
      return { ...coords, isFallback: false };
    }
  }

  // 3. Sprawdzamy znane lotniska i stacje
  const normDest = normalizeAttractionTitle(destinationCity || '');
  if (
    cleanTitle.includes('airport') ||
    cleanTitle.includes('lotnisk') ||
    cleanTitle.includes('aeroport') ||
    cleanTitle.includes('aeropuert')
  ) {
    for (const [cityKey, coords] of Object.entries(KNOWN_AIRPORTS_COORDINATES)) {
      const cleanCityKey = normalizeAttractionTitle(cityKey);
      if (normDest.includes(cleanCityKey) || cleanCityKey.includes(normDest) || cleanTitle.includes(cleanCityKey)) {
        GEOCODE_CACHE.set(cacheKey, coords);
        return { ...coords, isFallback: false };
      }
    }
  }

  if (
    cleanTitle.includes('station') ||
    cleanTitle.includes('dworzec') ||
    cleanTitle.includes('stacja') ||
    cleanTitle.includes('gare') ||
    cleanTitle.includes('stazione')
  ) {
    for (const [cityKey, coords] of Object.entries(KNOWN_STATIONS_COORDINATES)) {
      const cleanCityKey = normalizeAttractionTitle(cityKey);
      if (normDest.includes(cleanCityKey) || cleanCityKey.includes(normDest) || cleanTitle.includes(cleanCityKey)) {
        GEOCODE_CACHE.set(cacheKey, coords);
        return { ...coords, isFallback: false };
      }
    }
  }

  // 4. Pobieramy na żywo z Google Places API
  if (process.env.NODE_ENV !== 'test') {
    try {
      const place = await fetchGooglePlaceLocation(title, destinationCity);
      if (place && place.lat && place.lon) {
        GEOCODE_CACHE.set(cacheKey, { lat: place.lat, lon: place.lon });
        return { lat: place.lat, lon: place.lon, isFallback: false };
      }
    } catch (err) {
      console.warn('Google Places live geocode error:', err);
    }

    // 5. Pobieramy na żywo z Nominatim
    try {
      const nomCoords = await geocodeAttractionCoords(title, destinationCity);
      if (nomCoords && nomCoords.lat && nomCoords.lon) {
        GEOCODE_CACHE.set(cacheKey, nomCoords);
        return { ...nomCoords, isFallback: false };
      }
    } catch {
      // ignore
    }
  }

  // 6. Fallback na miasto
  const fallbackCoords = resolvePointCoordinates(title, pool, destinationCity, lodgingCoords, eventCoords);
  return { ...fallbackCoords, isFallback: true };
};

export const STREET_DISTANCE_CACHE = new Map<string, number>();

/**
 * Pobiera dokładne dane i współrzędne z Google Places API na żywo.
 * Zero sztucznych mocków - bezpośrednie zapytanie do serwerów Google Maps!
 */
export const fetchGooglePlaceLocation = async (
  title: string,
  destinationCity: string = ''
): Promise<{ lat: number; lon: number; name: string } | null> => {
  if (!title || !title.trim()) return null;
  const cleanTitle = normalizeAttractionTitle(title);
  const cleanCity = normalizeAttractionTitle(destinationCity);
  const cacheKey = `${cleanTitle}_${cleanCity}`;
  if (GEOCODE_CACHE.has(cacheKey)) {
    const cached = GEOCODE_CACHE.get(cacheKey)!;
    return { ...cached, name: title };
  }

  // W testach jednostkowych sprawdzamy słownik testowy
  if (process.env.NODE_ENV === 'test') {
    for (const [key, coords] of Object.entries(KNOWN_ATTRACTIONS_COORDINATES)) {
      const cleanKey = normalizeAttractionTitle(key);
      if (cleanTitle.includes(cleanKey) || cleanKey.includes(cleanTitle)) {
        GEOCODE_CACHE.set(cacheKey, coords);
        return { ...coords, name: title };
      }
    }
  }

  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY || 'AIzaSyAFeiDtoS013DQEmkjDsJkzBC7O_pu-ZOQ';
  if (!apiKey || apiKey.includes('TYMCZASOWY')) return null;

  try {
    let searchTitle = title.trim();
    const lower = searchTitle.toLowerCase();
    if (lower.includes('wyjazd') || lower.includes('departure') || lower.includes('powrót') || lower.includes('return')) {
      searchTitle = destinationCity ? `Airport, ${destinationCity}` : searchTitle;
    } else if (lower.includes('zameldowanie') || lower.includes('check-in') || lower.includes('lodging')) {
      searchTitle = destinationCity ? `Hotel, ${destinationCity}` : searchTitle;
    } else {
      searchTitle = searchTitle.replace(/^(zwiedzanie|atrakcja)[\s:\-–—]+/i, '').trim();
    }

    const query = destinationCity && destinationCity.trim() ? `${searchTitle}, ${destinationCity.trim()}` : searchTitle;
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=name,formatted_address,geometry&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].geometry?.location) {
      const loc = data.candidates[0].geometry.location;
      const result = {
        lat: loc.lat,
        lon: loc.lng,
        name: data.candidates[0].name || title,
      };
      GEOCODE_CACHE.set(cacheKey, { lat: result.lat, lon: result.lon });
      return result;
    }

    // Textsearch jako zapasowe zapytanie Google Places
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.results && searchData.results.length > 0 && searchData.results[0].geometry?.location) {
      const loc = searchData.results[0].geometry.location;
      const result = {
        lat: loc.lat,
        lon: loc.lng,
        name: searchData.results[0].name || title,
      };
      GEOCODE_CACHE.set(cacheKey, { lat: result.lat, lon: result.lon });
      return result;
    }
  } catch (err) {
    console.warn('Google Places live fetch error:', err);
  }

  return null;
};

/**
 * Pobiera rzeczywisty dystans siatki ulicznej pieszo z serwera routingu OSRM
 */
export const fetchRealStreetDistanceKm = async (
  p1: { lat: number; lon: number },
  p2: { lat: number; lon: number }
): Promise<number> => {
  const cacheKey = `${p1.lat.toFixed(4)},${p1.lon.toFixed(4)}_${p2.lat.toFixed(4)},${p2.lon.toFixed(4)}`;
  if (STREET_DISTANCE_CACHE.has(cacheKey)) {
    return STREET_DISTANCE_CACHE.get(cacheKey)!;
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0 && typeof data.routes[0].distance === 'number') {
        const distKm = Number((data.routes[0].distance / 1000).toFixed(2));
        STREET_DISTANCE_CACHE.set(cacheKey, distKm);
        return distKm;
      }
    } catch (err) {
      // fallback
    }
  }

  const straight = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
  const factor = straight < 2.0 ? 1.15 : 1.25;
  const fallbackDist = Number((straight * factor).toFixed(2));
  STREET_DISTANCE_CACHE.set(cacheKey, fallbackDist);
  return fallbackDist;
};

/**
 * Asynchroniczne dociąganie współrzędnych z OpenStreetMap Nominatim
 * dla dowolnej nieznanej atrakcji w dowolnym mieście na świecie.
 */
export const geocodeAttractionCoords = async (
  title: string,
  destinationCity: string = 'Rome'
): Promise<{ lat: number; lon: number } | null> => {
  if (!title || !title.trim()) return null;
  const cleanTitle = normalizeAttractionTitle(title);
  const cacheKey = `${cleanTitle}_${normalizeAttractionTitle(destinationCity)}`;
  if (GEOCODE_CACHE.has(cacheKey)) {
    return GEOCODE_CACHE.get(cacheKey)!;
  }

  // Najpierw sprawdzamy Google Places API na żywo!
  const googleRes = await fetchGooglePlaceLocation(title, destinationCity);
  if (googleRes) {
    return { lat: googleRes.lat, lon: googleRes.lon };
  }

  if (process.env.NODE_ENV === 'test') return null;

  try {
    const query = `${title.trim()}, ${destinationCity.trim()}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'DestivoApp/1.0' } });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      GEOCODE_CACHE.set(cacheKey, coords);
      return coords;
    }
  } catch (err) {
    // Graceful fallback
  }

  return null;
};

export interface TransitLegEstimate {
  walkMinutes: number;
  walkDistanceKm: number;
  transitMinutes: number;
  driveMinutes: number;
  driveDistanceKm: number;
  straightDistanceKm: number;
  recommendedMode: 'walking' | 'transit' | 'driving';
}

/**
 * Precyzyjnie wyznacza czasy dotarcia między dwoma dokładnymi miejscami atrakcji
 * odzwierciedlając czasy rzeczywiste z Google Maps (uwzględnia siatkę ulic,
 * światła drogowe, przystanki, oczekiwanie na transport i ruch miejski).
 */
/**
 * Precyzyjnie wyznacza czasy dotarcia między dwoma dokładnymi miejscami atrakcji
 * odzwierciedlając czasy rzeczywiste z Google Maps (uwzględnia siatkę ulic,
 * światła drogowe, przystanki, oczekiwanie na transport i ruch miejski).
 */
export const calculateTransitEstimates = (
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  customStreetDistanceKm?: number,
  customWalkDurationMinutes?: number,
  customDriveDurationMinutes?: number
): TransitLegEstimate => {
  const straightDist = haversineDistance(from.lat, from.lon, to.lat, to.lon);
  if (straightDist < 0.005) {
    return {
      walkMinutes: 1,
      walkDistanceKm: 0.1,
      transitMinutes: 1,
      driveMinutes: 1,
      driveDistanceKm: 0.1,
      straightDistanceKm: 0,
      recommendedMode: 'walking',
    };
  }

  const streetDistFactor = straightDist < 2.0 ? 1.15 : straightDist < 4.5 ? 1.35 : 1.22;
  const walkDistanceKm =
    customStreetDistanceKm !== undefined && customStreetDistanceKm > 0
      ? Number(customStreetDistanceKm.toFixed(1))
      : Number(Math.max(0.1, straightDist * streetDistFactor).toFixed(1));
  const driveDistanceKm = Number(Math.max(0.2, walkDistanceKm * 1.05).toFixed(1));

  // 1. PIESZO (Walking)
  // Prędkość marszu w Google Maps: ~4.5 - 4.8 km/h (~12.5 - 13.5 min/km)
  let walkMinutes: number;
  if (customWalkDurationMinutes !== undefined && customWalkDurationMinutes > 0) {
    walkMinutes = Math.max(1, Math.round(customWalkDurationMinutes));
  } else {
    walkMinutes = Math.max(1, Math.round(walkDistanceKm * 13.4));
  }

  // 2. KOMUNIKACJA MIEJSKA (Public Transit)
  // Krótki dystans: metro direct (~8-9 min)
  // Średni: metro z przesiadką (~15-22 min)
  // Długi / lotniskowy: kolej regionalna / szybki aerobus (~32-36 min)
  let transitMinutes = 9;
  if (walkDistanceKm <= 0.6) {
    transitMinutes = Math.min(walkMinutes, 7);
  } else if (walkDistanceKm <= 2.2) {
    transitMinutes = Math.max(6, Math.round(4.5 + walkDistanceKm * 2.8));
  } else if (walkDistanceKm <= 8.0) {
    transitMinutes = Math.max(12, Math.round(7.0 + walkDistanceKm * 3.0));
  } else {
    transitMinutes = Math.max(20, Math.round(10.0 + walkDistanceKm * 1.5));
  }

  // 3. AUTO / TAXI (Driving) - opcja poglądowa
  let driveMinutes = 9;
  if (customDriveDurationMinutes !== undefined && customDriveDurationMinutes > 0) {
    if (driveDistanceKm <= 3.0) {
      driveMinutes = Math.max(3, Math.round(customDriveDurationMinutes * 1.3 + 4.0));
    } else if (driveDistanceKm <= 8.0) {
      driveMinutes = Math.max(5, Math.round(customDriveDurationMinutes * 1.2 + 5.0));
    } else {
      driveMinutes = Math.max(8, Math.round(customDriveDurationMinutes + 2.5));
    }
  } else {
    if (driveDistanceKm <= 2.5) {
      driveMinutes = Math.max(3, Math.round(3.8 + driveDistanceKm * 3.0));
    } else if (driveDistanceKm <= 8.0) {
      driveMinutes = Math.round(5.0 + driveDistanceKm * 2.3);
    } else {
      driveMinutes = Math.round(6.0 + driveDistanceKm * 1.05);
    }
  }

  // Rekomendowany tryb dla turysty:
  // Turysta nie ma auta: jeśli da się przejść na piechotę (<= 1.2 km / <= 17 min), sugerujemy spacer.
  // Jeśli dystans jest większy (> 1.2 km), sugerujemy komunikację miejską.
  const recommendedMode: 'walking' | 'transit' | 'driving' =
    walkDistanceKm <= 1.2 ? 'walking' : 'transit';

  return {
    walkMinutes,
    walkDistanceKm,
    transitMinutes,
    driveMinutes,
    driveDistanceKm,
    straightDistanceKm: Number(straightDist.toFixed(2)),
    recommendedMode,
  };
};

export interface StreetRouteInfo extends TransitLegEstimate {}

export const ROUTE_INFO_CACHE = new Map<string, StreetRouteInfo>();

/**
 * Pobiera rzeczywiste dane drogowe i piesze z serwerów OSRM z automatycznym
 * dopasowaniem do czasów z Google Maps (uwzględnia światła, ruch miejski i przystanki).
 */
export const fetchRealRouteInfo = async (
  p1: { lat: number; lon: number },
  p2: { lat: number; lon: number }
): Promise<StreetRouteInfo> => {
  const cacheKey = `${p1.lat.toFixed(4)},${p1.lon.toFixed(4)}_${p2.lat.toFixed(4)},${p2.lon.toFixed(4)}`;
  if (ROUTE_INFO_CACHE.has(cacheKey)) {
    return ROUTE_INFO_CACHE.get(cacheKey)!;
  }

  const baseEstimate = calculateTransitEstimates(p1, p2);

  if (process.env.NODE_ENV === 'test') {
    ROUTE_INFO_CACHE.set(cacheKey, baseEstimate);
    return baseEstimate;
  }

  try {
    let customWalkDistKm: number | undefined;
    let customWalkDurationMins: number | undefined;
    let customDriveDistKm: number | undefined;
    let customDriveDurationMins: number | undefined;

    // 1. Zapytanie piesze (OSRM foot)
    try {
      const footUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;
      const footRes = await fetch(footUrl, { headers: { 'User-Agent': 'DestivoApp/1.0' } });
      const footData = await footRes.json();
      if (footData.routes && footData.routes.length > 0 && typeof footData.routes[0].distance === 'number') {
        customWalkDistKm = Number((footData.routes[0].distance / 1000).toFixed(1));
        customWalkDurationMins = footData.routes[0].duration / 60;
      }
    } catch {
      // fallback
    }

    // 2. Zapytanie samochodowe (OSRM driving)
    try {
      const driveUrl = `https://router.project-osrm.org/route/v1/driving/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;
      const driveRes = await fetch(driveUrl, { headers: { 'User-Agent': 'DestivoApp/1.0' } });
      const driveData = await driveRes.json();
      if (driveData.routes && driveData.routes.length > 0 && typeof driveData.routes[0].distance === 'number') {
        customDriveDistKm = Number((driveData.routes[0].distance / 1000).toFixed(1));
        customDriveDurationMins = driveData.routes[0].duration / 60;
      }
    } catch {
      // ignore
    }

    const liveResult = calculateTransitEstimates(
      p1,
      p2,
      customWalkDistKm,
      customWalkDurationMins,
      customDriveDurationMins
    );

    ROUTE_INFO_CACHE.set(cacheKey, liveResult);
    return liveResult;
  } catch (err) {
    ROUTE_INFO_CACHE.set(cacheKey, baseEstimate);
    return baseEstimate;
  }
};

/**
 * Buduje czytelny i precyzyjny link nawigacyjny Google Maps.
 * Jeśli przekazano nazwę miasta i tytuły atrakcji, używa pełnych nazw punktów,
 * dzięki czemu w Google Maps użytkownik widzi dokładnie "Sagrada Família" i "La Pedrera - Casa Milà"!
 */
export const buildGoogleMapsDirectionsUrl = (
  from: { lat?: number; lon?: number; title?: string; subtitle?: string },
  to: { lat?: number; lon?: number; title?: string; subtitle?: string },
  mode: 'walking' | 'transit' | 'driving' = 'transit',
  city?: string
): string => {
  const formatLocationParam = (point: { lat?: number; lon?: number; title?: string; subtitle?: string }): string => {
    const rawTitle = point.title?.trim() || '';
    const cleanCity = city?.trim() || '';

    // Sprawdzamy czy to punkt logistyczny (wyjazd, nocleg, powrót)
    const lower = rawTitle.toLowerCase();
    const isLodging =
      lower.includes('zameldowanie') ||
      lower.includes('check-in') ||
      lower.includes('check in') ||
      lower.includes('lodging') ||
      lower.includes('hotel');
    const isTransitStation =
      lower.includes('wyjazd') ||
      lower.includes('powrot') ||
      lower.includes('powrót') ||
      lower.includes('departure') ||
      lower.includes('return') ||
      rawTitle.includes('➔');

    // Jeśli nie podano miasta (np. testy jednostkowe z bezpośrednimi koordynatami), preferujemy lat,lon
    if (!cleanCity && point.lat !== undefined && point.lon !== undefined) {
      return `${point.lat},${point.lon}`;
    }

    // Jeśli to nocleg z adresem w subtitle, wstrzykujemy dokładny adres
    if (
      isLodging &&
      point.subtitle &&
      point.subtitle.trim() &&
      !point.subtitle.toLowerCase().includes('zwiedzanie') &&
      !point.subtitle.toLowerCase().includes('rekomendowane')
    ) {
      const address = point.subtitle.trim();
      if (cleanCity && !address.toLowerCase().includes(cleanCity.toLowerCase())) {
        return encodeURIComponent(`${address}, ${cleanCity}`);
      }
      return encodeURIComponent(address);
    }

    // Jeśli to punkt wylotu/powrotu, kierujemy na lotnisko lub stację w danym mieście
    if (isTransitStation) {
      const isTrain = lower.includes('pociag') || lower.includes('kolej') || lower.includes('train') || lower.includes('station');
      if (cleanCity) {
        return encodeURIComponent(isTrain ? `Central Station, ${cleanCity}` : `Airport, ${cleanCity}`);
      }
      return encodeURIComponent(isTrain ? 'Central Station' : 'Airport');
    }

    // Dla atrakcji czyścimy zbędne prefiksy
    const cleanTitle = rawTitle.replace(/^(zwiedzanie|atrakcja)[\s:\-–—]+/i, '').trim();

    // Jeśli podano miasto i punkt ma tytuł, łączymy je (np. "Sagrada Família, Barcelona")
    if (cleanCity && cleanTitle) {
      if (!cleanTitle.toLowerCase().includes(cleanCity.toLowerCase())) {
        return encodeURIComponent(`${cleanTitle}, ${cleanCity}`);
      }
      return encodeURIComponent(cleanTitle);
    }

    if (point.lat !== undefined && point.lon !== undefined) {
      return `${point.lat},${point.lon}`;
    }

    if (cleanTitle) {
      return encodeURIComponent(cleanTitle);
    }

    return encodeURIComponent(cleanCity || 'City Center');
  };

  const originParam = formatLocationParam(from);
  const destParam = formatLocationParam(to);

  return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=${mode}`;
};

/**
 * Buduje link do Google Maps z pełną trasą i wszystkimi kolejnymi przystankami (waypoints).
 * Ustawia kolejno pierwszy punkt jako start (origin), ostatni jako cel (destination),
 * a wszystkie pośrednie punkty zwiedzania jako przystanki (waypoints).
 */
export const buildGoogleMapsFullRouteUrl = (
  points: Array<{ lat?: number; lon?: number; title?: string; subtitle?: string }>,
  city?: string
): string => {
  if (!points || points.length === 0) return 'https://www.google.com/maps';
  const cleanCity = city?.trim() || '';

  const formatPt = (p: { lat?: number; lon?: number; title?: string; subtitle?: string }): string => {
    const rawTitle = (p.title || '').trim();
    const lower = rawTitle.toLowerCase();
    const isLodging =
      lower.includes('zameldowanie') ||
      lower.includes('check-in') ||
      lower.includes('check in') ||
      lower.includes('lodging') ||
      lower.includes('hotel');
    const isTransitStation =
      lower.includes('wyjazd') ||
      lower.includes('powrot') ||
      lower.includes('powrót') ||
      lower.includes('departure') ||
      lower.includes('return') ||
      rawTitle.includes('➔');

    // Nocleg
    if (
      isLodging &&
      p.subtitle &&
      p.subtitle.trim() &&
      !p.subtitle.toLowerCase().includes('zwiedzanie') &&
      !p.subtitle.toLowerCase().includes('rekomendowane')
    ) {
      const address = p.subtitle.trim();
      if (cleanCity && !address.toLowerCase().includes(cleanCity.toLowerCase())) {
        return encodeURIComponent(`${address}, ${cleanCity}`);
      }
      return encodeURIComponent(address);
    }

    // Lotnisko / Dworzec
    if (isTransitStation) {
      const isTrain = lower.includes('pociag') || lower.includes('kolej') || lower.includes('train') || lower.includes('station');
      if (cleanCity) {
        return encodeURIComponent(isTrain ? `Central Station, ${cleanCity}` : `Airport, ${cleanCity}`);
      }
      return encodeURIComponent(isTrain ? 'Central Station' : 'Airport');
    }

    // Atrakcja
    const cleanTitle = rawTitle.replace(/^(zwiedzanie|atrakcja)[\s:\-–—]+/i, '').trim();
    if (cleanCity && cleanTitle) {
      if (!cleanTitle.toLowerCase().includes(cleanCity.toLowerCase())) {
        return encodeURIComponent(`${cleanTitle}, ${cleanCity}`);
      }
      return encodeURIComponent(cleanTitle);
    }

    if (p.lat !== undefined && p.lon !== undefined) {
      return `${p.lat},${p.lon}`;
    }

    if (cleanTitle) {
      return encodeURIComponent(cleanTitle);
    }

    return encodeURIComponent(cleanCity || 'City Center');
  };

  if (points.length === 1) {
    const singleParam = formatPt(points[0]);
    return `https://www.google.com/maps/search/?api=1&query=${singleParam}`;
  }

  const originParam = formatPt(points[0]);
  const destParam = formatPt(points[points.length - 1]);

  // Google Maps Universal URL obsługuje do 9 przystanków pośrednich (waypoints)
  const waypoints = points
    .slice(1, points.length - 1)
    .slice(0, 9)
    .map(formatPt)
    .join('%7C');

  if (!waypoints) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}`;
  }

  return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&waypoints=${waypoints}`;
};

/**
 * Bezpiecznie parsuje datę i czas w formacie DD-MM-YYYY lub YYYY-MM-DD
 */
export const parseTimelineDate = (dateStr: string | null | undefined, timeStr?: string): Date => {
  if (!dateStr || !dateStr.trim()) return new Date();
  const clean = dateStr.trim().replace(/\./g, '-');
  const parts = clean.split('-');
  let year = 2026;
  let month = 0;
  let day = 1;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      year = Number(parts[0]) || 2026;
      month = Math.max(0, Math.min(11, (Number(parts[1]) || 1) - 1));
      day = Math.max(1, Math.min(31, Number(parts[2]) || 1));
    } else {
      // DD-MM-YYYY
      day = Math.max(1, Math.min(31, Number(parts[0]) || 1));
      month = Math.max(0, Math.min(11, (Number(parts[1]) || 1) - 1));
      year = Number(parts[2]) || 2026;
    }
  }
  const date = new Date(year, month, day);
  if (timeStr && timeStr.trim()) {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      date.setHours(Number(match[1]) || 0, Number(match[2]) || 0, 0, 0);
    }
  }
  return date;
};

/**
 * Konwertuje ciąg 'HH:MM' na liczbę minut od północy (0..1439).
 */
export const timeStrToMinutes = (timeStr?: string): number => {
  if (!timeStr || !timeStr.trim()) return 12 * 60;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 12 * 60;
  const h = Math.max(0, Math.min(23, parseInt(match[1], 10)));
  const m = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return h * 60 + m;
};

/**
 * Konwertuje minuty od północy z powrotem na 'HH:MM'.
 */
export const minutesToTimeStr = (totalMinutes: number): string => {
  const norm = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export interface IntelligentInsertionResult {
  insertIndex: number;
  dateStr: string;
  timeStr: string;
  parsedDate: Date;
}

/**
 * Inteligentnie wyznacza indeks wstawienia oraz optymalną godzinę i datę
 * dla nowej atrakcji tak, aby znalazła się między punktami leżącymi najbliżej niej
 * pod kątem współrzędnych geograficznych GPS.
 */
export const findIntelligentInsertionSlot = <
  T extends {
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    dateStr: string;
    timeStr?: string;
    parsedDate?: Date;
    lat?: number;
    lon?: number;
    [key: string]: any;
  }
>(
  events: T[],
  newPoint: { title: string; lat?: number; lon?: number },
  attractionsPool: any[] = [],
  destinationCity?: string,
  lodgingAddress?: string,
  transportType?: string,
  defaultDateStr?: string
): IntelligentInsertionResult => {
  const getEventCoords = (evt: T): { lat: number; lon: number } => {
    if (
      typeof evt.lat === 'number' &&
      typeof evt.lon === 'number' &&
      !isNaN(evt.lat) &&
      !isNaN(evt.lon) &&
      (evt.lat !== 0 || evt.lon !== 0)
    ) {
      return { lat: evt.lat, lon: evt.lon };
    }
    let query = evt.title;
    if (evt.type === 'LODGING' && lodgingAddress) {
      query = lodgingAddress;
    } else if (evt.type === 'DEPARTURE' || evt.type === 'RETURN') {
      query =
        transportType === 'flight'
          ? `Airport, ${destinationCity || ''}`
          : `Central Station, ${destinationCity || ''}`;
    }
    const resolved = resolvePointCoordinates(
      query,
      attractionsPool,
      destinationCity,
      null,
      { lat: evt.lat, lon: evt.lon }
    );
    return { lat: resolved.lat, lon: resolved.lon };
  };

  let targetLat = newPoint.lat;
  let targetLon = newPoint.lon;
  if (
    typeof targetLat !== 'number' ||
    typeof targetLon !== 'number' ||
    isNaN(targetLat) ||
    isNaN(targetLon) ||
    (targetLat === 0 && targetLon === 0)
  ) {
    const resolved = resolvePointCoordinates(newPoint.title, attractionsPool, destinationCity);
    targetLat = resolved.lat;
    targetLon = resolved.lon;
  }

  const fallbackDateStr = defaultDateStr || (events.length > 0 ? events[0].dateStr : '01-01-2026');

  if (events.length === 0) {
    return {
      insertIndex: 0,
      dateStr: fallbackDateStr,
      timeStr: '11:00',
      parsedDate: parseTimelineDate(fallbackDateStr, '11:00'),
    };
  }

  // Wyznaczamy dozwolony zakres wstawiania:
  // Nie wstawiamy przed pierwszym DEPARTURE i nie po ostatnim RETURN
  let minIdx = 0;
  if (events[0].type === 'DEPARTURE') {
    minIdx = 1;
  }

  let maxIdx = events.length;
  if (events[events.length - 1].type === 'RETURN') {
    maxIdx = events.length - 1;
  }

  if (minIdx > maxIdx) {
    minIdx = maxIdx;
  }

  if (minIdx === maxIdx) {
    const prevEvt = minIdx > 0 ? events[minIdx - 1] : null;
    const nextEvt = minIdx < events.length ? events[minIdx] : null;
    const dStr = prevEvt?.dateStr || nextEvt?.dateStr || fallbackDateStr;
    const tStr = '11:00';
    return {
      insertIndex: minIdx,
      dateStr: dStr,
      timeStr: tStr,
      parsedDate: parseTimelineDate(dStr, tStr),
    };
  }

  const attractions = events
    .map((e, idx) => ({ evt: e, idx }))
    .filter((x) => x.evt.type === 'ATTRACTION');

  let bestSlot = maxIdx;

  if (attractions.length > 0) {
    // 1. Znajdujemy atrakcję leżącą najbliżej dodawanego punktu
    let closestAttractionIdx = attractions[0].idx;
    let minDistance = Infinity;

    for (const { evt, idx } of attractions) {
      const c = getEventCoords(evt);
      const dist = haversineDistance(c.lat, c.lon, targetLat, targetLon);
      if (dist < minDistance) {
        minDistance = dist;
        closestAttractionIdx = idx;
      }
    }

    // 2. Mamy dwie pozycje wstawienia względem najbliższej atrakcji:
    // - Opcja A: bezpośrednio PRZED nią (między poprzednikiem a najbliższą)
    // - Opcja B: bezpośrednio PO niej (między najbliższą a następnikiem)
    const canInsertBefore = closestAttractionIdx >= minIdx;
    const canInsertAfter = closestAttractionIdx + 1 <= maxIdx;

    if (canInsertBefore && canInsertAfter) {
      const cCoords = getEventCoords(events[closestAttractionIdx]);
      const prevCoords = getEventCoords(events[closestAttractionIdx - 1]);
      const nextCoords = getEventCoords(events[closestAttractionIdx + 1]);

      // Koszt objazdu / dodatkowy dystans dla Opcji A
      const dPrevTarget = haversineDistance(prevCoords.lat, prevCoords.lon, targetLat, targetLon);
      const dTargetC = haversineDistance(targetLat, targetLon, cCoords.lat, cCoords.lon);
      const dPrevC = haversineDistance(prevCoords.lat, prevCoords.lon, cCoords.lat, cCoords.lon);
      const detourBefore = dPrevTarget + dTargetC - dPrevC;

      // Koszt objazdu / dodatkowy dystans dla Opcji B
      const dTargetNext = haversineDistance(targetLat, targetLon, nextCoords.lat, nextCoords.lon);
      const dCNext = haversineDistance(cCoords.lat, cCoords.lon, nextCoords.lat, nextCoords.lon);
      const detourAfter = dTargetC + dTargetNext - dCNext;

      if (detourBefore <= detourAfter) {
        bestSlot = closestAttractionIdx;
      } else {
        bestSlot = closestAttractionIdx + 1;
      }
    } else if (canInsertBefore) {
      bestSlot = closestAttractionIdx;
    } else if (canInsertAfter) {
      bestSlot = closestAttractionIdx + 1;
    }
  } else {
    // Brak innych atrakcji (same punkty logistyczne jak DEPARTURE, LODGING, RETURN)
    let minDetour = Infinity;
    for (let k = minIdx; k <= maxIdx; k++) {
      const prevEvt = events[k - 1];
      const nextEvt = k < events.length ? events[k] : null;
      if (prevEvt && nextEvt) {
        const pC = getEventCoords(prevEvt);
        const nC = getEventCoords(nextEvt);
        const detour =
          haversineDistance(pC.lat, pC.lon, targetLat, targetLon) +
          haversineDistance(targetLat, targetLon, nC.lat, nC.lon) -
          haversineDistance(pC.lat, pC.lon, nC.lat, nC.lon);
        if (detour < minDetour) {
          minDetour = detour;
          bestSlot = k;
        }
      } else {
        bestSlot = k;
      }
    }
  }

  // Wyznaczamy datę i optymalną godzinę wstawianego punktu
  const prevEvt = bestSlot > 0 ? events[bestSlot - 1] : null;
  const nextEvt = bestSlot < events.length ? events[bestSlot] : null;

  let targetDateStr = fallbackDateStr;
  let targetTimeStr = '12:00';

  if (prevEvt && nextEvt) {
    if (prevEvt.dateStr === nextEvt.dateStr) {
      targetDateStr = prevEvt.dateStr;
      const prevM = timeStrToMinutes(prevEvt.timeStr);
      const nextM = timeStrToMinutes(nextEvt.timeStr);
      if (nextM > prevM + 15) {
        targetTimeStr = minutesToTimeStr(Math.round((prevM + nextM) / 2));
      } else {
        targetTimeStr = minutesToTimeStr(Math.min(22 * 60, prevM + 45));
      }
    } else {
      // Różne dni między punktem poprzednim a następnym - przypisujemy do tego dnia,
      // którego punkt jest bliżej pod kątem odległości geograficznej
      const prevCoords = getEventCoords(prevEvt);
      const nextCoords = getEventCoords(nextEvt);
      const distToPrev = haversineDistance(prevCoords.lat, prevCoords.lon, targetLat, targetLon);
      const distToNext = haversineDistance(nextCoords.lat, nextCoords.lon, targetLat, targetLon);

      if (distToPrev <= distToNext) {
        targetDateStr = prevEvt.dateStr;
        const prevM = timeStrToMinutes(prevEvt.timeStr);
        targetTimeStr = minutesToTimeStr(Math.min(21 * 60, prevM + 60));
      } else {
        targetDateStr = nextEvt.dateStr;
        const nextM = timeStrToMinutes(nextEvt.timeStr);
        targetTimeStr = minutesToTimeStr(Math.max(9 * 60, nextM - 60));
      }
    }
  } else if (prevEvt) {
    targetDateStr = prevEvt.dateStr;
    const prevM = timeStrToMinutes(prevEvt.timeStr);
    targetTimeStr = minutesToTimeStr(Math.min(21 * 60, prevM + 60));
  } else if (nextEvt) {
    targetDateStr = nextEvt.dateStr;
    const nextM = timeStrToMinutes(nextEvt.timeStr);
    targetTimeStr = minutesToTimeStr(Math.max(9 * 60, nextM - 60));
  }

  const parsedDate = parseTimelineDate(targetDateStr, targetTimeStr);

  return {
    insertIndex: bestSlot,
    dateStr: targetDateStr,
    timeStr: targetTimeStr,
    parsedDate,
  };
};

/**
 * Wstawia nową atrakcję w odpowiednie miejsce osi czasu zgodnie z lokalizacją
 * i koryguje ewentualne kolizje godzin na danym dniu.
 */
export const insertTimelineEventIntelligently = <
  T extends {
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    dateStr: string;
    timeStr?: string;
    parsedDate?: Date;
    lat?: number;
    lon?: number;
    [key: string]: any;
  }
>(
  events: T[],
  newEventData: {
    id: string;
    title: string;
    subtitle?: string;
    lat?: number;
    lon?: number;
    dateStr?: string;
    timeStr?: string;
    type?: string;
  },
  attractionsPool: any[] = [],
  destinationCity?: string,
  lodgingAddress?: string,
  transportType?: string,
  defaultDateStr?: string
): T[] => {
  const hasCustomDate = Boolean(newEventData.dateStr && newEventData.dateStr.trim());
  const hasCustomTime = Boolean(newEventData.timeStr && newEventData.timeStr.trim());

  let insertion: IntelligentInsertionResult;
  if (hasCustomDate && hasCustomTime) {
    const pDate = parseTimelineDate(newEventData.dateStr!, newEventData.timeStr!);
    let slot = events.findIndex((e) => {
      const eDate = e.parsedDate || parseTimelineDate(e.dateStr, e.timeStr);
      return eDate.getTime() > pDate.getTime();
    });
    if (slot === -1) slot = events.length;
    let minIdx = 0;
    if (events.length > 0 && events[0].type === 'DEPARTURE') minIdx = 1;
    let maxIdx = events.length;
    if (events.length > 0 && events[events.length - 1].type === 'RETURN') maxIdx = events.length - 1;
    const finalSlot = Math.max(minIdx, Math.min(maxIdx, slot));
    insertion = {
      insertIndex: finalSlot,
      dateStr: newEventData.dateStr!,
      timeStr: newEventData.timeStr!,
      parsedDate: pDate,
    };
  } else {
    insertion = findIntelligentInsertionSlot(
      events,
      newEventData,
      attractionsPool,
      destinationCity,
      lodgingAddress,
      transportType,
      newEventData.dateStr || defaultDateStr
    );
  }

  const createdEvent: T = {
    ...newEventData,
    id: newEventData.id,
    type: newEventData.type || 'ATTRACTION',
    title: newEventData.title,
    subtitle: newEventData.subtitle,
    dateStr: insertion.dateStr,
    timeStr: insertion.timeStr,
    parsedDate: insertion.parsedDate,
    lat: newEventData.lat,
    lon: newEventData.lon,
  } as T;

  const result = [...events];
  result.splice(insertion.insertIndex, 0, createdEvent);

  // Korygujemy ewentualne kolizje godzin na tym samym dniu
  let lastM = timeStrToMinutes(insertion.timeStr);
  const targetDateStr = insertion.dateStr;

  for (let j = insertion.insertIndex + 1; j < result.length; j++) {
    if (result[j].dateStr === targetDateStr) {
      const curM = timeStrToMinutes(result[j].timeStr);
      if (curM <= lastM) {
        const adjustedM = Math.min(23 * 60 + 30, lastM + 45);
        const adjustedTimeStr = minutesToTimeStr(adjustedM);
        result[j] = {
          ...result[j],
          timeStr: adjustedTimeStr,
          parsedDate: parseTimelineDate(result[j].dateStr, adjustedTimeStr),
        };
        lastM = adjustedM;
      } else {
        lastM = curM;
      }
    }
  }

  return result;
};

