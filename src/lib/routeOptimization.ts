// src/lib/routeOptimization.ts
import { getGoogleApiKey, getOsrmBaseUrl } from './config';

/**
 * Moduł Inteligentnej Optymalizacji Trasy Zwiedzania (Problem Komiwojażera / TSP)
 * Implementacja algorytmów optymalizacji kombinatorycznej dla pracy inżynierskiej:
 * - Algorytm Zachłanny (Nearest Neighbor / Greedy)
 * - Przeszukiwanie Lokalne (2-Opt Local Search)
 * - Symulowane Wyżarzanie (Simulated Annealing)
 * - Metoda Dokładna (Brute Force / Global Optimum dla N <= 8)
 * 
 * Zawiera wyznaczanie macierzy drogowej OSRM Table API, macierzy odległości Haversine
 * oraz pomiary wydajnościowe (czas obliczeń, iteracje, redukcja czasu przejazdu/dystansu).
 */

export type OptimizationCriterion = 'duration' | 'distance';
export type OptimizationProfile = 'driving' | 'walking';

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
  cost?: number;
  costUnit?: 'seconds' | 'km' | 'meters';
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
  hasCollapsedCoordinates?: boolean;
  isApproximate?: boolean;
  criterion?: OptimizationCriterion;
  originalCost?: number;
  optimizedCost?: number;
  costUnit?: 'seconds' | 'km' | 'meters' | 's' | 'm';
  timeEstimateCategory?: 'osrm_road_duration' | 'none_in_approximate_mode';
  routeStatus?: 'road_confirmed' | 'straight_line_estimate';
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
 * Oblicza sumaryczną długość/koszt otwartej ścieżki Hamiltona (Open Hamiltonian Path),
 * tj. przechodzącej przez punkty w danej kolejności od punktu początkowego do końcowego
 * bez powrotu do punktu startowego (w przeciwieństwie do zamkniętego cyklu TSP powracającego
 * do bazy, co precyzyjnie odpowiada scenariuszowi pieszego lub drogowego planu zwiedzania).
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
 * Weryfikuje czy tablica indeksów stanowi ścisłą permutację zbioru {0, 1, ..., expectedLength - 1}.
 * Gwarantuje, że żaden wierzchołek nie został pominięty, zduplikowany ani dodany.
 */
export const isPermutation = (route: number[], expectedLength: number): boolean => {
  if (!Array.isArray(route) || route.length !== expectedLength) return false;
  const seen = new Set<number>();
  for (let i = 0; i < expectedLength; i++) {
    const val = route[i];
    if (typeof val !== 'number' || val < 0 || val >= expectedLength || seen.has(val)) {
      return false;
    }
    seen.add(val);
  }
  return seen.size === expectedLength;
};

/**
 * Ścisła walidacja macierzy kosztów:
 * - sprawdza czy macierz ma dokładnie N wierszy i N kolumn,
 * - sprawdza czy wszystkie wartości są skończonymi liczbami nieujemnymi,
 * - sprawdza czy nie występują null, undefined, NaN lub Infinity.
 */
export const validateCostMatrix = (
  matrix: any,
  expectedN: number
): { valid: boolean; error?: string } => {
  if (!Array.isArray(matrix)) {
    return { valid: false, error: 'Macierz kosztów nie jest tablicą.' };
  }
  if (matrix.length !== expectedN) {
    return {
      valid: false,
      error: `Nieprawidłowa liczba wierszy macierzy (${matrix.length} zamiast ${expectedN}).`,
    };
  }
  for (let i = 0; i < expectedN; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      return { valid: false, error: `Wiersz ${i} macierzy nie jest tablicą.` };
    }
    if (row.length !== expectedN) {
      return {
        valid: false,
        error: `Wiersz ${i} ma nieprawidłową liczbę kolumn (${row.length} zamiast ${expectedN}).`,
      };
    }
    for (let j = 0; j < expectedN; j++) {
      const val = row[j];
      if (i === j) {
        if (typeof val !== 'number' || !Number.isFinite(val) || Math.abs(val) > 1e-6) {
          return {
            valid: false,
            error: `Wartość na przekątnej macierzy [${i}][${i}] musi wynosić 0 (otrzymano ${val}).`,
          };
        }
        continue;
      }
      if (val === null) {
        return {
          valid: false,
          error: `Wartość w komórce [${i}][${j}] wynosi null (odcinek nieosiągalny OSRM). Macierz dla algorytmu TSP nie może zawierać nieosiągalnych połączeń.`,
        };
      }
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
        return {
          valid: false,
          error: `Wartość w komórce [${i}][${j}] nie jest prawidłową liczbą skończoną (${val}).`,
        };
      }
      if (val < 0) {
        return {
          valid: false,
          error: `Wartość w komórce [${i}][${j}] jest ujemna (${val}).`,
        };
      }
    }
  }
  return { valid: true };
};

/**
 * Walidacja macierzy OSRM przeznaczonej do pamięci podręcznej (cache).
 * W formacie OSRM Table API dopuszczalne są liczby nieujemne skończone ORAZ null
 * (oznaczające brak trasy / odcinki nieprzejezdne w durations i distances).
 * Odrzuca: brak tablicy, zły rozmiar wierszy/kolumn, NaN, wartości ujemne oraz niezerową przekątną.
 */
export const validateOsrmCacheMatrix = (
  matrix: any,
  expectedN: number
): { valid: boolean; error?: string } => {
  if (!Array.isArray(matrix)) {
    return { valid: false, error: 'Macierz OSRM nie jest tablicą.' };
  }
  if (matrix.length !== expectedN) {
    return {
      valid: false,
      error: `Nieprawidłowa liczba wierszy macierzy OSRM (${matrix.length} zamiast ${expectedN}).`,
    };
  }
  for (let i = 0; i < expectedN; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      return { valid: false, error: `Wiersz ${i} macierzy OSRM nie jest tablicą.` };
    }
    if (row.length !== expectedN) {
      return {
        valid: false,
        error: `Wiersz ${i} ma nieprawidłową liczbę kolumn (${row.length} zamiast ${expectedN}).`,
      };
    }
    for (let j = 0; j < expectedN; j++) {
      const val = row[j];
      if (i === j) {
        if (typeof val !== 'number' || !Number.isFinite(val) || Math.abs(val) > 1e-6) {
          return {
            valid: false,
            error: `Wartość na przekątnej OSRM [${i}][${i}] musi wynosić 0 (otrzymano ${val}).`,
          };
        }
        continue;
      }
      // W OSRM null poza przekątną jest legalnym wskaźnikiem braku połączenia (unreachable)
      if (val === null) {
        continue;
      }
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
        return {
          valid: false,
          error: `Wartość w komórce OSRM [${i}][${j}] jest niepoprawna (${val}).`,
        };
      }
      if (val < 0) {
        return {
          valid: false,
          error: `Wartość w komórce OSRM [${i}][${j}] jest ujemna (${val}).`,
        };
      }
    }
  }
  return { valid: true };
};

/**
 * 1. Algorytm Zachłanny (Nearest Neighbor)
 * Heurystyka konstrukcyjna wyznaczająca otwartą ścieżkę Hamiltona.
 * Rozpoczyna od wskazanego punktu startowego i w każdym kroku wybiera najbliższy
 * jeszcze nieodwiedzony punkt na podstawie niezaokrąglonych kosztów macierzy.
 * Jako heurystyka NIE daje gwarancji znalezienia globalnego optimum.
 * Złożoność obliczeniowa: O(N^2)
 */
export const solveGreedyTSP = (
  matrix: number[][],
  startIndex: number = 0
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  if (!matrix || !Array.isArray(matrix)) {
    throw new Error('solveGreedyTSP: Macierz kosztów nie jest tablicą.');
  }
  const n = matrix.length;
  if (n === 0) {
    return { route: [], distance: 0, iterations: 1, timeMs: 0 };
  }
  if (n === 1) {
    if (!Array.isArray(matrix[0]) || matrix[0].length !== 1) {
      throw new Error('solveGreedyTSP: Niepoprawny wiersz macierzy dla N=1.');
    }
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }

  const val = validateCostMatrix(matrix, n);
  if (!val.valid) {
    throw new Error(`solveGreedyTSP: Niepoprawna macierz kosztów: ${val.error}`);
  }

  const start = Date.now();
  const safeStart = startIndex >= 0 && startIndex < n ? startIndex : 0;
  const visited = new Set<number>();
  visited.add(safeStart);
  const route: number[] = [safeStart];
  let iterations = 0;

  while (visited.size < n) {
    const current = route[route.length - 1];
    let nearestNode = -1;
    let minDistance = Infinity;

    for (let next = 0; next < n; next++) {
      iterations++;
      if (!visited.has(next)) {
        const d = matrix[current][next];
        // Porównanie z pełną precyzją bez zaokrągleń
        if (d < minDistance) {
          minDistance = d;
          nearestNode = next;
        }
      }
    }

    if (nearestNode !== -1 && Number.isFinite(minDistance)) {
      visited.add(nearestNode);
      route.push(nearestNode);
    } else {
      break;
    }
  }

  // Uzupełnienie wierzchołków w przypadku braku połączeń
  if (route.length < n) {
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) {
        route.push(i);
      }
    }
  }

  if (!isPermutation(route, n)) {
    throw new Error('solveGreedyTSP: Wynikowa trasa nie jest poprawną permutacją wierzchołków.');
  }

  const distance = calculatePathDistance(route, matrix);
  const timeMs = Math.max(1, Date.now() - start);

  return { route, distance, iterations, timeMs };
};

export interface OsrmTableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
  sources?: Array<{ location: [number, number]; name: string }>;
  destinations?: Array<{ location: [number, number]; name: string }>;
  message?: string;
}

export interface OsrmMatrixResult {
  matrix: number[][];
  durations?: (number | null)[][];
  distances?: (number | null)[][];
  criterion: OptimizationCriterion;
  profile: OptimizationProfile;
  isApproximate: boolean;
}

export interface FetchOsrmMatrixOptions {
  criterion?: OptimizationCriterion;
  profile?: OptimizationProfile;
  timeoutMs?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  maxRetries?: number;
}

export interface OsrmCacheEntry {
  data: OsrmMatrixResult;
  timestamp: number;
  expiresAt: number;
}

/**
 * Pamięć podręczna macierzy OSRM z obsługą TTL (Time-To-Live),
 * limitem rozmiaru (LRU eviction) oraz ochroną przed kolizjami.
 */
export class OsrmMatrixCache {
  private cache = new Map<string, OsrmCacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries: number = 100, defaultTtlMs: number = 15 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Głębokie klonowanie obiektu wynikowego OSRM w celu ochrony przed mutacją
   * przechowywanej w pamięci macierzy przez kod zewnętrzny (defensive copying).
   * Zachowuje wartości null dla nieosiągalnych tras.
   */
  private cloneResult(res: OsrmMatrixResult): OsrmMatrixResult {
    const cloned: OsrmMatrixResult = {
      matrix: res.matrix.map((row) => (Array.isArray(row) ? row.map((cell) => cell) : [])),
      criterion: res.criterion,
      profile: res.profile,
      isApproximate: res.isApproximate,
    };
    if (res.durations) {
      cloned.durations = res.durations.map((row) => (Array.isArray(row) ? row.map((cell) => cell) : []));
    }
    if (res.distances) {
      cloned.distances = res.distances.map((row) => (Array.isArray(row) ? row.map((cell) => cell) : []));
    }
    return cloned;
  }

  /**
   * Generuje znormalizowany klucz pamięci podręcznej.
   * Współrzędne są formatowane z precyzją 7 miejsc po przecinku (~1.1 cm),
   * co eliminuje fałszywe kolizje dla blisko położonych punktów.
   */
  public generateKey(
    points: GeoPoint[],
    profile: string,
    criterion: 'duration' | 'distance',
    baseUrl: string = ''
  ): string {
    const coordsKey = points
      .map((p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`)
      .join(';');
    return `${baseUrl}_${profile}_${criterion}_${coordsKey}`;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  get(key: string): OsrmMatrixResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // LRU: odświeżenie pozycji w Map
    this.cache.delete(key);
    this.cache.set(key, entry);
    // Zwracamy kopię obronną, aby modyfikacje wywołującego nie zatruły cache
    return this.cloneResult(entry.data);
  }

  set(key: string, data: OsrmMatrixResult, customTtlMs?: number): void {
    if (!data || !Array.isArray(data.matrix)) {
      throw new Error('OsrmMatrixCache.set: Próba zapisu nieprawidłowego obiektu do pamięci podręcznej.');
    }
    const val = validateOsrmCacheMatrix(data.matrix, data.matrix.length);
    if (!val.valid) {
      throw new Error(`OsrmMatrixCache.set: Próba zapisu uszkodzonej macierzy do pamięci podręcznej: ${val.error}`);
    }
    if (data.durations) {
      const durVal = validateOsrmCacheMatrix(data.durations, data.matrix.length);
      if (!durVal.valid) {
        throw new Error(`OsrmMatrixCache.set: Próba zapisu uszkodzonej macierzy durations do cache: ${durVal.error}`);
      }
    }
    if (data.distances) {
      const distVal = validateOsrmCacheMatrix(data.distances, data.matrix.length);
      if (!distVal.valid) {
        throw new Error(`OsrmMatrixCache.set: Próba zapisu uszkodzonej macierzy distances do cache: ${distVal.error}`);
      }
    }

    const ttl = customTtlMs ?? this.defaultTtlMs;
    const now = Date.now();

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Usunięcie najstarszego wpisu (LRU)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    // Bezpieczny deep clone przed zapisaniem w strukturze cache (zachowuje null)
    const clonedData = this.cloneResult(data);

    this.cache.set(key, {
      data: clonedData,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    this.purgeExpired();
    return this.cache.size;
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  getMaxEntries(): number {
    return this.maxEntries;
  }

  getDefaultTtlMs(): number {
    return this.defaultTtlMs;
  }
}

export const OSRM_MATRIX_CACHE = new OsrmMatrixCache(100, 15 * 60 * 1000);

// Deduplikacja równoległych zapytań OSRM Table API w toku (in-flight cache)
export const IN_FLIGHT_OSRM_REQUESTS = new Map<string, Promise<OsrmMatrixResult>>();

export const clearInFlightOsrmRequests = (): void => {
  IN_FLIGHT_OSRM_REQUESTS.clear();
};

/**
 * Pobiera macierz czasów przejazdu lub odległości z OSRM Table API.
 * Gwarantuje porządek współrzędnych longitude,latitude oraz ścisłą walidację wymiarów.
 * Wartości null (brak przejezdnego połączenia) są jawnie wykrywane i rzucają wyjątek.
 * Posiada wbudowaną deduplikację równoległych żądań, obsługę anulowania (AbortSignal) i retry.
 */
export const fetchOsrmRoadMatrix = async (
  points: GeoPoint[],
  options: FetchOsrmMatrixOptions = {}
): Promise<OsrmMatrixResult> => {
  const {
    criterion = 'duration',
    profile = 'driving',
    timeoutMs = 8000,
    baseUrl = getOsrmBaseUrl(),
  } = options;

  const n = points.length;
  if (n < 2) {
    return {
      matrix: [[0]],
      durations: [[0]],
      distances: [[0]],
      criterion,
      profile,
      isApproximate: false,
    };
  }

  // 1. Walidacja współrzędnych
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (
      !p ||
      typeof p.lat !== 'number' ||
      typeof p.lon !== 'number' ||
      !isFinite(p.lat) ||
      !isFinite(p.lon) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lon) > 180
    ) {
      throw new Error(
        `Niepoprawne współrzędne geograficzne punktu "${p?.title || i}" (lat: ${p?.lat}, lon: ${p?.lon}).`
      );
    }
  }

  // 2. Klucz pamięci podręcznej (precyzja 7 miejsc po przecinku ~1.1cm chroniąca przed kolizjami)
  const cacheKey = OSRM_MATRIX_CACHE.generateKey(points, profile, criterion, baseUrl);
  if (OSRM_MATRIX_CACHE.has(cacheKey)) {
    return OSRM_MATRIX_CACHE.get(cacheKey)!;
  }

  // 2b. Deduplikacja równoległych żądań: jeśli identyczne zapytanie jest w trakcie, współdzielimy Promise
  if (IN_FLIGHT_OSRM_REQUESTS.has(cacheKey)) {
    return IN_FLIGHT_OSRM_REQUESTS.get(cacheKey)!;
  }

  const runFetch = async (): Promise<OsrmMatrixResult> => {
    const coordsParam = points.map((p) => `${p.lon},${p.lat}`).join(';');
    const url = `${baseUrl}/table/v1/${profile}/${coordsParam}?annotations=duration,distance`;

    const externalSignal = options.signal;
    if (externalSignal?.aborted) {
      throw new Error('Żądanie OSRM zostało anulowane przez użytkownika.');
    }

    const maxRetries = options.maxRetries ?? (process.env.NODE_ENV === 'test' ? 0 : 1);
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      attempt++;
      if (externalSignal?.aborted) {
        throw new Error('Żądanie OSRM zostało anulowane przez użytkownika.');
      }

      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'DestivoApp/1.0',
          },
        });

        clearTimeout(timeoutId);
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }

        if (!response.ok) {
          if (profile === 'walking' && (response.status === 400 || response.status === 404)) {
            throw new Error(`Serwer OSRM (${baseUrl}) nie obsługuje profilu pieszego "walking".`);
          }
          throw new Error(`Serwer OSRM zwrócił błąd HTTP ${response.status} (${response.statusText}).`);
        }

        let data: OsrmTableResponse;
        try {
          data = await response.json();
        } catch (parseErr: any) {
          throw new Error(`Błąd parsowania odpowiedzi serwera OSRM: ${parseErr?.message || 'Niepoprawny JSON'}`);
        }

        if (!data || typeof data !== 'object') {
          throw new Error('Odpowiedź serwera OSRM ma nieprawidłowy format.');
        }

        if (data.code !== 'Ok') {
          throw new Error(`Serwer OSRM zwrócił kod błędu "${data.code}": ${data.message || 'Brak szczegółów'}`);
        }

        const rawDurations = data.durations;
        const rawDistances = data.distances;
        const rawSelected = criterion === 'distance' ? rawDistances : rawDurations;

        if (!rawSelected || !Array.isArray(rawSelected) || rawSelected.length !== n) {
          throw new Error(
            `Odpowiedź OSRM nie zawiera prawidłowej macierzy ${criterion}. Oczekiwano ${n} wierszy, otrzymano ${rawSelected ? rawSelected.length : 0}.`
          );
        }

        // 4. Weryfikacja wymiarów i wartości null (brak przejazdu)
        const unreachablePairs: Array<{ from: string; to: string }> = [];
        const validatedMatrix: number[][] = [];

        for (let i = 0; i < n; i++) {
          const row = rawSelected[i];
          if (!row || !Array.isArray(row) || row.length !== n) {
            throw new Error(
              `Wiersz ${i} macierzy OSRM ma nieprawidłowy wymiar (${row ? row.length : 0} zamiast ${n}).`
            );
          }
          const validatedRow: number[] = [];
          for (let j = 0; j < n; j++) {
            const val = row[j];
            if (i === j) {
              validatedRow.push(0);
            } else if (val === null || val === undefined || typeof val !== 'number' || !isFinite(val)) {
              unreachablePairs.push({
                from: points[i]?.title || `Punkt ${i}`,
                to: points[j]?.title || `Punkt ${j}`,
              });
              validatedRow.push(Infinity);
            } else if (val < 0) {
              throw new Error(
                `Niepoprawny ujemny koszt trasy (${val}) między punktami "${points[i].title}" a "${points[j].title}".`
              );
            } else {
              validatedRow.push(val);
            }
          }
          validatedMatrix.push(validatedRow);
        }

        if (unreachablePairs.length > 0) {
          const pairsDesc = unreachablePairs.map((p) => `"${p.from}" -> "${p.to}"`).join(', ');
          throw new Error(
            `OSRM_UNREACHABLE_POINTS: Brak połączenia drogowego między wybranymi punktami: ${pairsDesc} (odcinki nieprzejezdne).`
          );
        }

        const matrixValidation = validateCostMatrix(validatedMatrix, n);
        if (!matrixValidation.valid) {
          throw new Error(`Niepoprawna macierz OSRM: ${matrixValidation.error}`);
        }

        const result: OsrmMatrixResult = {
          matrix: validatedMatrix,
          durations: rawDurations,
          distances: rawDistances,
          criterion,
          profile,
          isApproximate: false,
        };

        OSRM_MATRIX_CACHE.set(cacheKey, result);
        return result;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }

        if (externalSignal?.aborted || (err?.name === 'AbortError' && externalSignal?.aborted)) {
          throw new Error('Żądanie OSRM zostało anulowane przez użytkownika.');
        }

        let formattedError = err;
        if (err?.name === 'AbortError') {
          formattedError = new Error(`Przekroczono limit czasu (${timeoutMs} ms) podczas odpytywania serwera OSRM Table API.`);
        } else if (!err?.message?.includes('OSRM') && !err?.message?.includes('HTTP')) {
          formattedError = new Error(`Błąd połączenia z serwerem OSRM: ${err?.message || 'Brak połączenia sieciowego'}`);
        }

        lastError = formattedError;

        // Ponawiamy wyłącznie w przypadku błędu przejściowego (HTTP 5xx, timeout, brak połączenia)
        const isTransient =
          formattedError?.message?.includes('limit czasu') ||
          formattedError?.message?.includes('Błąd połączenia') ||
          formattedError?.message?.includes('HTTP 5');

        if (isTransient && attempt <= maxRetries && !externalSignal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        throw formattedError;
      }
    }

    throw lastError || new Error('Nieznany błąd serwera OSRM');
  };

  const reqPromise = runFetch().finally(() => {
    IN_FLIGHT_OSRM_REQUESTS.delete(cacheKey);
  });

  IN_FLIGHT_OSRM_REQUESTS.set(cacheKey, reqPromise);
  return reqPromise;
};

/**
 * Formalna definicja operatora Relocate:
 * Przenosi wierzchołek znajdujący się pod indeksem fromIndex (0 <= fromIndex < route.length)
 * na docelową pozycję targetIndex (0 <= targetIndex < route.length) W WYNIKOWEJ TABLICY.
 *
 * Model referencyjny:
 * Niech R = [r_0, r_1, ..., r_{n-1}].
 * Wierzchołek przenoszony: x = R[fromIndex].
 * Tablica po usunięciu x: R' = [r_0, ..., r_{fromIndex-1}, r_{fromIndex+1}, ..., r_{n-1}] (długość n-1).
 * Wynikowa tablica po wstawieniu x na pozycję targetIndex:
 * R_res = [...R'.slice(0, targetIndex), x, ...R'.slice(targetIndex)].
 * 
 * Formalne własności:
 * 1. R_res.length === R.length
 * 2. R_res[targetIndex] === R[fromIndex]
 * 3. Jeśli fromIndex === targetIndex, wynik to R (ruch tożsamościowy, brak zmian).
 * 4. R_res stanowi ścisłą permutację elementów R (żaden wierzchołek nie ginie ani nie jest powielany).
 */
export const applyRelocateMove = (
  route: number[],
  fromIndex: number,
  targetIndex: number
): number[] => {
  if (
    !Array.isArray(route) ||
    fromIndex < 0 ||
    fromIndex >= route.length ||
    targetIndex < 0 ||
    targetIndex >= route.length
  ) {
    throw new Error(
      `applyRelocateMove: Nieprawidłowe indeksy fromIndex=${fromIndex}, targetIndex=${targetIndex} dla tablicy o długości ${route?.length}.`
    );
  }
  if (fromIndex === targetIndex) {
    return [...route];
  }
  const next = [...route];
  const [item] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
};

/**
 * 2. Algorytm 2-Opt (Local Search) z operatorem Relocate dla ATSP
 * Heurystyka przeszukiwania lokalnego łącząca inwersję krawędzi (2-opt) z operatorem
 * wstawiania wierzchołka (Relocate / Node Insertion).
 * Minimalizuje koszt otwartej ścieżki Hamiltona na podstawie niezaokrąglonych wartości macierzy.
 * Zapobiega utknięciu w minimach lokalnych na asymetrycznych macierzach OSRM (np. ulice jednokierunkowe).
 * Jako heurystyka NIE daje gwarancji znalezienia globalnego optimum.
 */
export const solveTwoOptTSP = (
  initialRoute: number[],
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  if (!matrix || !Array.isArray(matrix)) {
    throw new Error('solveTwoOptTSP: Macierz kosztów nie jest tablicą.');
  }
  const n = matrix.length;
  if (n === 0) {
    return { route: [], distance: 0, iterations: 1, timeMs: 0 };
  }
  if (n === 1) {
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }

  const val = validateCostMatrix(matrix, n);
  if (!val.valid) {
    throw new Error(`solveTwoOptTSP: Niepoprawna macierz kosztów: ${val.error}`);
  }

  if (!Array.isArray(initialRoute) || initialRoute.length !== n) {
    throw new Error(`solveTwoOptTSP: initialRoute musi mieć długość ${n}.`);
  }

  const start = Date.now();
  let route = [...initialRoute];

  if (n === 2) {
    if (!fixStart) {
      const c1 = calculatePathDistance([route[0], route[1]], matrix);
      const c2 = calculatePathDistance([route[1], route[0]], matrix);
      if (c2 < c1) {
        route = [route[1], route[0]];
      }
    }
    return {
      route,
      distance: calculatePathDistance(route, matrix),
      iterations: 1,
      timeMs: Math.max(1, Date.now() - start),
    };
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;
  const startIndex = fixStart ? 1 : 0;
  let currentCost = calculatePathDistance(route, matrix);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Krok 1: Ruch 2-Opt (odwrócenie podciągu) z rzeczywistą oceną skierowanych krawędzi (ATSP)
    for (let i = startIndex; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidateRoute = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        if (!isPermutation(candidateRoute, n)) {
          continue;
        }
        const candidateCost = calculatePathDistance(candidateRoute, matrix);

        // Porównanie niezaokrąglonych kosztów z minimalną tolerancją numeryczną
        if (candidateCost < currentCost - 1e-9) {
          route = candidateRoute;
          currentCost = candidateCost;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }

    // Krok 2: Jeśli odwrócenie 2-opt nie dało poprawy (np. przez asymetrię sieci drogowej),
    // badamy operację Relocate (przeniesienie wierzchołka na inną pozycję bez odwracania)
    if (!improved) {
      for (let i = startIndex; i < n; i++) {
        for (let targetPos = startIndex; targetPos < n; targetPos++) {
          if (targetPos === i) continue; // to samo ułożenie

          const candidateRoute = applyRelocateMove(route, i, targetPos);
          if (!isPermutation(candidateRoute, n)) {
            continue;
          }

          const candidateCost = calculatePathDistance(candidateRoute, matrix);
          if (candidateCost < currentCost - 1e-9) {
            route = candidateRoute;
            currentCost = candidateCost;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
  }

  if (!isPermutation(route, n)) {
    throw new Error('solveTwoOptTSP: Wynikowa trasa nie jest poprawną permutacją wierzchołków.');
  }

  const distance = calculatePathDistance(route, matrix);
  const timeMs = Math.max(1, Date.now() - start);

  return { route, distance, iterations, timeMs };
};

/**
 * Heurystyka przeszukiwania lokalnego z operatorem Relocate (Node Insertion) dla ATSP.
 * Przeszukuje pełne sąsiedztwo wszystkich dopuszczalnych ruchów przeniesienia wierzchołka:
 * dla każdego i z dozwolonego zakresu oraz każdego targetPos != i.
 * Gwarantuje zachowanie fixStart (nigdy nie przenosi wierzchołka startowego ani nie wstawia na pozycję 0).
 * Zwraca niezaokrąglony koszt i trasę będącą permutacją wierzchołków.
 */
export const solveRelocateTSP = (
  initialRoute: number[],
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  if (!matrix || !Array.isArray(matrix)) {
    throw new Error('solveRelocateTSP: Macierz kosztów nie jest tablicą.');
  }
  const n = matrix.length;
  if (n === 0) {
    return { route: [], distance: 0, iterations: 1, timeMs: 0 };
  }
  if (n === 1) {
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }

  const val = validateCostMatrix(matrix, n);
  if (!val.valid) {
    throw new Error(`solveRelocateTSP: Niepoprawna macierz kosztów: ${val.error}`);
  }

  if (!Array.isArray(initialRoute) || initialRoute.length !== n) {
    throw new Error(`solveRelocateTSP: initialRoute musi mieć długość ${n}.`);
  }

  const start = Date.now();
  let route = [...initialRoute];

  if (n === 2) {
    if (!fixStart) {
      const c1 = calculatePathDistance([route[0], route[1]], matrix);
      const c2 = calculatePathDistance([route[1], route[0]], matrix);
      if (c2 < c1) {
        route = [route[1], route[0]];
      }
    }
    return {
      route,
      distance: calculatePathDistance(route, matrix),
      iterations: 1,
      timeMs: Math.max(1, Date.now() - start),
    };
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;
  const startIndex = fixStart ? 1 : 0;
  let currentCost = calculatePathDistance(route, matrix);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = startIndex; i < n; i++) {
      for (let targetPos = startIndex; targetPos < n; targetPos++) {
        if (targetPos === i) continue;

        const candidateRoute = applyRelocateMove(route, i, targetPos);
        if (!isPermutation(candidateRoute, n)) {
          continue;
        }

        const candidateCost = calculatePathDistance(candidateRoute, matrix);
        if (candidateCost < currentCost - 1e-9) {
          route = candidateRoute;
          currentCost = candidateCost;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  if (!isPermutation(route, n)) {
    throw new Error('solveRelocateTSP: Wynikowa trasa nie jest poprawną permutacją wierzchołków.');
  }

  const distance = calculatePathDistance(route, matrix);
  const timeMs = Math.max(1, Date.now() - start);

  return { route, distance, iterations, timeMs };
};

/**
 * 3. Symulowane Wyżarzanie (Simulated Annealing)
 * Metaheurystyka probabilistyczna z ruchem hybrydowym 2-Opt i Relocate dla problemu ATSP
 * na otwartej ścieżce Hamiltona. Porównuje niezaokrąglone koszty.
 * Jako metaheurystyka NIE daje gwarancji znalezienia globalnego optimum.
 */
export const solveSimulatedAnnealingTSP = (
  initialRoute: number[],
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } => {
  if (!matrix || !Array.isArray(matrix)) {
    throw new Error('solveSimulatedAnnealingTSP: Macierz kosztów nie jest tablicą.');
  }
  const n = matrix.length;
  if (n === 0) {
    return { route: [], distance: 0, iterations: 1, timeMs: 0 };
  }
  if (n === 1) {
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }

  const val = validateCostMatrix(matrix, n);
  if (!val.valid) {
    throw new Error(`solveSimulatedAnnealingTSP: Niepoprawna macierz kosztów: ${val.error}`);
  }

  const start = Date.now();
  let currentRoute = [...initialRoute];

  if (n === 2) {
    if (!fixStart) {
      const c1 = calculatePathDistance([currentRoute[0], currentRoute[1]], matrix);
      const c2 = calculatePathDistance([currentRoute[1], currentRoute[0]], matrix);
      if (c2 < c1) {
        currentRoute = [currentRoute[1], currentRoute[0]];
      }
    }
    return {
      route: currentRoute,
      distance: calculatePathDistance(currentRoute, matrix),
      iterations: 1,
      timeMs: Math.max(1, Date.now() - start),
    };
  }

  let bestRoute = [...currentRoute];
  let currentDist = calculatePathDistance(currentRoute, matrix);
  let bestDist = currentDist;

  let temp = 100.0;
  const coolingRate = 0.98;
  const minTemp = 0.01;
  let iterations = 0;
  const startIndex = fixStart ? 1 : 0;

  while (temp > minTemp && iterations < 1500) {
    iterations++;

    let candidateRoute: number[];
    const range = n - startIndex;

    if (Math.random() < 0.5 && range >= 2) {
      // Ruch 2-opt (odwrócenie losowego podciągu)
      const i = startIndex + Math.floor(Math.random() * (range - 1));
      const j = i + 1 + Math.floor(Math.random() * (n - i - 1));
      candidateRoute = [
        ...currentRoute.slice(0, i),
        ...currentRoute.slice(i, j + 1).reverse(),
        ...currentRoute.slice(j + 1),
      ];
    } else {
      // Ruch Relocate (przeniesienie wierzchołka)
      const fromIdx = startIndex + Math.floor(Math.random() * range);
      let toIdx = startIndex + Math.floor(Math.random() * range);
      if (toIdx === fromIdx && range > 1) {
        toIdx = toIdx === n - 1 ? startIndex : toIdx + 1;
      }
      candidateRoute = applyRelocateMove(currentRoute, fromIdx, toIdx);
    }

    if (!isPermutation(candidateRoute, n)) {
      continue;
    }

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

  if (!isPermutation(bestRoute, n)) {
    throw new Error('solveSimulatedAnnealingTSP: Wynikowa trasa nie jest poprawną permutacją.');
  }

  const timeMs = Math.max(1, Date.now() - start);

  return { route: bestRoute, distance: bestDist, iterations, timeMs };
};

/**
 * 4. Metoda Dokładna (Brute Force) dla N <= 8
 * Sprawdza wszystkie możliwe permutacje otwartej ścieżki Hamiltona ((N-1)! przy ustalonym
 * punkcie startowym lub N! przy swobodnym starcie), gwarantując znalezienie globalnego optimum
 * dla małych instancji problemu.
 */
export const solveBruteForceTSP = (
  matrix: number[][],
  fixStart: boolean = true
): { route: number[]; distance: number; iterations: number; timeMs: number } | null => {
  if (!matrix || !Array.isArray(matrix)) {
    throw new Error('solveBruteForceTSP: Macierz kosztów nie jest tablicą.');
  }
  const n = matrix.length;
  if (n === 0) return { route: [], distance: 0, iterations: 1, timeMs: 0 };
  if (n === 1) {
    if (!Array.isArray(matrix[0]) || matrix[0].length !== 1) {
      throw new Error('solveBruteForceTSP: Niepoprawny wiersz macierzy dla N=1.');
    }
    return { route: [0], distance: 0, iterations: 1, timeMs: 0 };
  }
  if (n > 8) return null; // Zabezpieczenie złożoności obliczeniowej dla N > 8

  // Ścisła walidacja macierzy
  const val = validateCostMatrix(matrix, n);
  if (!val.valid) {
    throw new Error(`solveBruteForceTSP: Niepoprawna macierz kosztów: ${val.error}`);
  }

  const start = Date.now();
  const indices: number[] = Array.from({ length: n }, (_, i) => i);
  let bestRoute: number[] = [...indices];
  let bestDist = Infinity;
  let iterations = 0;

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
    permute(indices, 0);
  }

  if (!isPermutation(bestRoute, n)) {
    throw new Error('solveBruteForceTSP: Wynikowa trasa nie jest poprawną permutacją.');
  }

  const timeMs = Math.max(1, Date.now() - start);
  return { route: bestRoute, distance: bestDist, iterations, timeMs };
};

export type MatrixSourceType = 'osrm-table' | 'haversine-calculated' | 'custom-verified';

export interface OptimizeSightseeingOptions {
  customMatrix?: number[][];
  matrixSource?: MatrixSourceType;
  criterion?: OptimizationCriterion;
  isApproximate?: boolean;
}

/**
 * Główna funkcja wykonująca pełną analizę i optymalizację trasy TSP.
 * Uruchamia algorytmy, tworzy tabelę benchmarków i wybiera trasę minimalizującą zadany koszt
 * (czas w sekundach OSRM lub odległość w metrach OSRM / kilometrach Haversine).
 * Wszystkie porównania tras bazują na niezaokrąglonych kosztach rzeczywistych.
 * 
 * Jeśli nie przekazano customMatrix lub macierz jest niepoprawna, używa macierzy Haversine
 * z jawnym oznaczeniem isApproximate = true.
 */
export const optimizeSightseeingRoute = (
  points: GeoPoint[],
  fixStartPoint: boolean = false,
  customMatrixOrOptions?: number[][] | OptimizeSightseeingOptions,
  legacyCriterion?: OptimizationCriterion,
  legacyIsApproximate?: boolean
): OptimizationResult => {
  if (points.length < 2) {
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
      hasCollapsedCoordinates: false,
      isApproximate: true,
      criterion: 'distance',
      originalCost: 0,
      optimizedCost: 0,
      costUnit: 'km',
      routeStatus: 'straight_line_estimate',
    };
  }

  let customMatrix: number[][] | undefined;
  let criterion: OptimizationCriterion = 'distance';
  let isApproximate = false;

  if (Array.isArray(customMatrixOrOptions)) {
    customMatrix = customMatrixOrOptions;
    criterion = legacyCriterion || 'distance';
    isApproximate = legacyIsApproximate !== undefined ? legacyIsApproximate : false;
  } else if (customMatrixOrOptions && typeof customMatrixOrOptions === 'object') {
    customMatrix = customMatrixOrOptions.customMatrix;
    criterion = customMatrixOrOptions.criterion || 'duration';
    isApproximate = customMatrixOrOptions.isApproximate ?? false;
  }

  let isRoadMatrix = false;
  if (customMatrix && !isApproximate) {
    const val = validateCostMatrix(customMatrix, points.length);
    if (val.valid) {
      isRoadMatrix = true;
    } else {
      console.warn('Niepoprawna macierz customMatrix w optimizeSightseeingRoute:', val.error);
      isApproximate = true;
      criterion = 'distance';
    }
  }

  const matrix = isRoadMatrix ? customMatrix! : buildDistanceMatrix(points);
  if (!isRoadMatrix) {
    isApproximate = true;
    criterion = 'distance';
  }

  const costUnit: 'seconds' | 'meters' | 'km' =
    criterion === 'duration' ? 'seconds' : isRoadMatrix ? 'meters' : 'km';

  const initialRoute = points.map((_, idx) => idx);
  const rawOriginalCost = calculatePathDistance(initialRoute, matrix);

  // Weryfikacja czy w punktach występuje kolaps współrzędnych (identyczne punkty lub odległość < 5 metrów)
  const hMatrix = buildDistanceMatrix(points);
  let identicalCount = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (hMatrix[i][j] < 0.005) {
        identicalCount++;
      }
    }
  }
  const haversineOriginalDistance = calculatePathDistance(initialRoute, hMatrix);
  const hasCollapsedCoordinates = haversineOriginalDistance < 0.01 || identicalCount > 0;

  const benchmarks: AlgorithmBenchmark[] = [];

  // 1. Algorytm Zachłanny (Nearest Neighbor)
  let greedyRes = solveGreedyTSP(matrix, 0);
  if (!fixStartPoint) {
    for (let s = 1; s < points.length; s++) {
      const cand = solveGreedyTSP(matrix, s);
      // Porównanie z pełną precyzją bez zaokrągleń
      if (cand.distance < greedyRes.distance) {
        greedyRes = cand;
      }
    }
  }
  benchmarks.push({
    algorithmId: 'greedy',
    name: 'Algorytm Zachłanny (Nearest Neighbor)',
    distanceKm: calculatePathDistance(greedyRes.route, hMatrix),
    cost: greedyRes.distance,
    costUnit,
    timeMs: greedyRes.timeMs,
    iterations: greedyRes.iterations,
    routeIndices: greedyRes.route,
  });

  // 2. Przeszukiwanie Lokalne (2-Opt + Relocate dla ATSP)
  const twoOptRes = solveTwoOptTSP(greedyRes.route, matrix, fixStartPoint);
  benchmarks.push({
    algorithmId: '2opt',
    name: 'Przeszukiwanie Lokalne (2-Opt / ATSP)',
    distanceKm: calculatePathDistance(twoOptRes.route, hMatrix),
    cost: twoOptRes.distance,
    costUnit,
    timeMs: twoOptRes.timeMs,
    iterations: twoOptRes.iterations,
    routeIndices: twoOptRes.route,
  });

  // 3. Symulowane Wyżarzanie (Simulated Annealing) - startujemy ze zoptymalizowanej trasy
  const saRes = solveSimulatedAnnealingTSP(twoOptRes.route, matrix, fixStartPoint);
  benchmarks.push({
    algorithmId: 'simulated_annealing',
    name: 'Symulowane Wyżarzanie (Simulated Annealing)',
    distanceKm: calculatePathDistance(saRes.route, hMatrix),
    cost: saRes.distance,
    costUnit,
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
        name: 'Metoda Dokładna (Globalne Optimum dla N<=8)',
        distanceKm: calculatePathDistance(bfRes.route, hMatrix),
        cost: bfRes.distance,
        costUnit,
        timeMs: bfRes.timeMs,
        iterations: bfRes.iterations,
        routeIndices: bfRes.route,
      });
    }
  }

  // Wybieramy najlepszy uzyskany wynik według niezaokrąglonego kosztu
  let best = benchmarks[0];
  for (const b of benchmarks) {
    const bCost = b.cost !== undefined ? b.cost : b.distanceKm;
    const bestCost = best.cost !== undefined ? best.cost : best.distanceKm;
    if (bCost < bestCost) {
      best = b;
    }
  }

  // Weryfikacja: wybrana trasa nie może mieć kosztu większego niż trasa początkowa
  const bestRawCost = best.cost !== undefined ? best.cost : best.distanceKm;
  let finalRouteIndices = best.routeIndices;
  let finalRawCost = bestRawCost;

  if (bestRawCost > rawOriginalCost) {
    finalRouteIndices = initialRoute;
    finalRawCost = rawOriginalCost;
  }

  if (!isPermutation(finalRouteIndices, points.length)) {
    finalRouteIndices = initialRoute;
    finalRawCost = rawOriginalCost;
  }

  // Obliczenie oszczędności dystansu i czasu
  let rawOriginalDistanceKm = calculatePathDistance(initialRoute, hMatrix);
  let rawFinalDistanceKm = calculatePathDistance(finalRouteIndices, hMatrix);
  let rawSavingsKm = 0;
  let timeSavedMinutes = 0;
  let savingsPercent = 0;

  if (criterion === 'duration') {
    // Koszt w sekundach z sieci drogowej OSRM
    const savedSeconds = Math.max(0, rawOriginalCost - finalRawCost);
    timeSavedMinutes = Math.max(0, Math.round(savedSeconds / 60));
    savingsPercent = rawOriginalCost > 0 ? (savedSeconds / rawOriginalCost) * 100 : 0;
    rawSavingsKm = Math.max(0, rawOriginalDistanceKm - rawFinalDistanceKm);
  } else if (isRoadMatrix && criterion === 'distance') {
    // Odległość w metrach z sieci drogowej OSRM Table API
    const savedMeters = Math.max(0, rawOriginalCost - finalRawCost);
    savingsPercent = rawOriginalCost > 0 ? (savedMeters / rawOriginalCost) * 100 : 0;
    rawOriginalDistanceKm = rawOriginalCost / 1000;
    rawFinalDistanceKm = finalRawCost / 1000;
    rawSavingsKm = savedMeters / 1000;
    // W trybie odległości drogowej: brak optymalizacji czasu przejazdu
    timeSavedMinutes = 0;
  } else {
    // Odległość Haversine w km (tryb przybliżony w linii prostej)
    const savedKm = Math.max(0, rawOriginalCost - finalRawCost);
    savingsPercent = rawOriginalCost > 0 ? (savedKm / rawOriginalCost) * 100 : 0;
    rawSavingsKm = savedKm;
    // W trybie Haversine NIE prezentujemy czasu jako rzeczywistego czasu przejazdu
    timeSavedMinutes = 0;
  }

  const orderedPoints = finalRouteIndices.map((idx) => points[idx]);

  // Zaokrąglenia stosujemy WYŁĄCZNIE przy prezentacji wyników
  return {
    orderedPoints,
    originalDistanceKm: Number(rawOriginalDistanceKm.toFixed(2)),
    optimizedDistanceKm: Number(rawFinalDistanceKm.toFixed(2)),
    savingsKm: Number(rawSavingsKm.toFixed(2)),
    savingsPercent: Number(savingsPercent.toFixed(1)),
    timeSavedMinutes,
    timeEstimateCategory: criterion === 'duration' ? 'osrm_road_duration' : 'none_in_approximate_mode',
    bestAlgorithm: {
      ...best,
      distanceKm: Number(best.distanceKm.toFixed(2)),
      cost: best.cost !== undefined ? Number(best.cost.toFixed(1)) : undefined,
    },
    benchmarks: benchmarks.map((b) => ({
      ...b,
      distanceKm: Number(b.distanceKm.toFixed(2)),
      cost: b.cost !== undefined ? Number(b.cost.toFixed(1)) : undefined,
    })),
    hasCollapsedCoordinates,
    isApproximate,
    criterion,
    originalCost: Number(rawOriginalCost.toFixed(1)),
    optimizedCost: Number(finalRawCost.toFixed(1)),
    costUnit,
    routeStatus: isRoadMatrix && !isApproximate ? 'road_confirmed' : 'straight_line_estimate',
  };
};

/**
 * Pobiera macierz z OSRM Table API i optymalizuje trasę w oparciu o sieć drogową.
 */
export const optimizeSightseeingRouteWithRoadNetwork = async (
  points: GeoPoint[],
  fixStartPoint: boolean = false,
  options: FetchOsrmMatrixOptions = {}
): Promise<OptimizationResult> => {
  if (points.length < 2) {
    return optimizeSightseeingRoute(points, fixStartPoint);
  }

  const roadMatrixResult = await fetchOsrmRoadMatrix(points, options);
  return optimizeSightseeingRoute(points, fixStartPoint, {
    customMatrix: roadMatrixResult.matrix,
    criterion: roadMatrixResult.criterion,
    isApproximate: false,
  });
};

export interface DayRouteWithHotelResult {
  orderedAttractions: GeoPoint[];
  fullTour: GeoPoint[]; // [Hotel, ...orderedAttractions, Hotel] gdy podano hotel
  totalCost: number; // Całkowity koszt pętli z hotelem (lub ścieżki bez hotelu)
  outboundCost: number; // Hotel -> pierwsza atrakcja (0 jeśli brak hotelu)
  attractionsCost: number; // Koszt przejazdów między kolejnymi atrakcjami
  returnCost: number; // Ostatnia atrakcja -> Hotel (0 jeśli brak hotelu)
  hasHotel: boolean;
  costUnit: 'seconds' | 'km' | 'meters' | 's' | 'm';
  isApproximate: boolean;
  effectiveCriterion: OptimizationCriterion;
  routeStatus: 'road_confirmed' | 'straight_line_estimate';
}

/**
 * Optymalizuje trasę jednodniową z uwzględnieniem hotelu jako punktu startowego i końcowego (Depot TSP).
 * 
 * Zasady jednostek i trybu:
 * - OSRM duration (rzeczywista macierz + duration + !isApproximate) = 's' (sekundy).
 * - OSRM distance (rzeczywista macierz + distance + !isApproximate) = 'm' (metry drogowe).
 * - Brak macierzy OSRM lub tryb przybliżony = 'km' (Haversine w kilometrach, effectiveCriterion = 'distance').
 * ZASADA BEZWZGLĘDNA: Nie wolno przypisywać jednostki sekund ('s') do odległości Haversine!
 * 
 * Walidacja macierzy:
 * - Przy podaniu options.matrix wymaga pełnego rozmiaru N x N (gdzie N = K + 1 z hotelem, N = K bez hotelu).
 * - Wymaga skończonych liczb nieujemnych i zerowej przekątnej (matrix[i][i] === 0).
 */
export interface OptimizeDayRouteWithHotelOptions {
  matrix?: number[][];
  matrixSource?: MatrixSourceType;
  matrixCostUnit?: 's' | 'm' | 'km';
  matrixPointIds?: string[];
  criterion?: OptimizationCriterion;
  isApproximate?: boolean;
}

export const optimizeDayRouteWithHotel = (
  hotel: GeoPoint | null | undefined,
  attractions: GeoPoint[],
  options?: OptimizeDayRouteWithHotelOptions
): DayRouteWithHotelResult => {
  const hasHotel = Boolean(
    hotel &&
      typeof hotel.lat === 'number' &&
      Number.isFinite(hotel.lat) &&
      typeof hotel.lon === 'number' &&
      Number.isFinite(hotel.lon)
  );

  const K = attractions.length;
  const expectedN = hasHotel ? K + 1 : K;
  const hasRawMatrix = Boolean(options?.matrix && Array.isArray(options.matrix));

  // 1. Walidacja zadeklarowanego źródła macierzy (MatrixSourceType)
  if (options?.matrixSource === 'osrm-table') {
    if (options?.matrixCostUnit === 'km') {
      throw new Error(
        'optimizeDayRouteWithHotel: Źródło "osrm-table" nie dostarcza macierzy w kilometrach (km). OSRM Table API zwraca sekundy (durations) lub metry (distances).'
      );
    }
    if (options?.isApproximate === true) {
      throw new Error(
        'optimizeDayRouteWithHotel: Źródło "osrm-table" nie może być użyte w trybie przybliżonym (isApproximate=true).'
      );
    }
  } else if (options?.matrixSource === 'haversine-calculated') {
    if (options?.matrixCostUnit && options.matrixCostUnit !== 'km') {
      throw new Error(
        `optimizeDayRouteWithHotel: Źródło "haversine-calculated" wymaga jednostki "km" (otrzymano "${options.matrixCostUnit}").`
      );
    }
  } else if (options?.matrixSource === 'custom-verified') {
    if (!options?.matrixCostUnit) {
      throw new Error(
        'optimizeDayRouteWithHotel: Dla źródła "custom-verified" wymagane jest jawne podanie parametru matrixCostUnit (\'s\' | \'m\' | \'km\'). Metadane źródła nie mogą być uznane za wiarygodne bez zadeklarowania jednostki.'
      );
    }
  }

  // 2. Odrzucenie sprzecznych konfiguracji jednostek drogowych w trybie przybliżonym
  if (options?.isApproximate === true) {
    if (hasRawMatrix && (options?.matrixCostUnit === 's' || options?.matrixCostUnit === 'm')) {
      throw new Error(
        `optimizeDayRouteWithHotel: Sprzeczna konfiguracja. Przekazano macierz drogową w jednostkach "${options.matrixCostUnit}" z wymuszoną flagą isApproximate=true. W trybie przybliżonym jednostką mogą być wyłącznie kilometry (km).`
      );
    }
  }

  // 3. Weryfikacja matrixPointIds (jeśli przekazano)
  const expectedPointIds = hasHotel
    ? [hotel!.id, ...attractions.map((a) => a.id)]
    : attractions.map((a) => a.id);

  if (hasRawMatrix && options?.matrixPointIds) {
    if (
      !Array.isArray(options.matrixPointIds) ||
      options.matrixPointIds.length !== expectedPointIds.length ||
      !options.matrixPointIds.every((id, idx) => id === expectedPointIds[idx])
    ) {
      throw new Error(
        `optimizeDayRouteWithHotel: Niezgodność identyfikatorów lub kolejności punktów w matrixPointIds. Oczekiwano [${expectedPointIds.join(', ')}], otrzymano [${(options.matrixPointIds || []).join(', ')}].`
      );
    }
  }

  // 4. Ścisła walidacja przekazanej macierzy opcjonalnej
  let hasValidCustomMatrix = false;
  if (hasRawMatrix) {
    const val = validateCostMatrix(options!.matrix!, expectedN);
    if (!val.valid) {
      throw new Error(
        `optimizeDayRouteWithHotel: Niepoprawna macierz kosztów (${expectedN}x${expectedN} dla ${K} atrakcji ${
          hasHotel ? '+ hotel' : 'bez hotelu'
        }): ${val.error}`
      );
    }
    hasValidCustomMatrix = true;
  }

  // 5. Weryfikacja fizycznego rzędu wielkości (Magnitude Heuristic Validation)
  if (hasRawMatrix && options?.matrix) {
    const allCandidateNodes = hasHotel ? [hotel!, ...attractions] : attractions;
    let maxGeoDistanceKm = 0;
    for (let i = 0; i < allCandidateNodes.length; i++) {
      for (let j = i + 1; j < allCandidateNodes.length; j++) {
        const d = haversineDistance(
          allCandidateNodes[i].lat,
          allCandidateNodes[i].lon,
          allCandidateNodes[j].lat,
          allCandidateNodes[j].lon
        );
        if (d > maxGeoDistanceKm) maxGeoDistanceKm = d;
      }
    }

    if (maxGeoDistanceKm >= 0.1) {
      let maxMatrixVal = 0;
      for (const row of options.matrix) {
        for (const cell of row) {
          if (typeof cell === 'number' && Number.isFinite(cell) && cell > maxMatrixVal) {
            maxMatrixVal = cell;
          }
        }
      }

      // Jeśli wywołujący zadeklarował kilometry (km), ale wartości są wielokrotnie wyższe niż rzeczywisty dystans GPS
      if (
        (options?.matrixCostUnit === 'km' || options?.matrixSource === 'haversine-calculated') &&
        maxMatrixVal > Math.max(100, maxGeoDistanceKm * 20)
      ) {
        throw new Error(
          `optimizeDayRouteWithHotel: Wykryto rozbieżność rzędu wielkości kosztów. Zadeklarowano jednostkę "km", ale wartości w macierzy (maksimum: ${maxMatrixVal}) przekraczają wielokrotnie odległości geograficzne punktów (maksimum: ${maxGeoDistanceKm.toFixed(
            1
          )} km). Prawdopodobnie omyłkowo przekazano sekundy lub metry jako kilometry.`
        );
      }

      // Jeśli wywołujący zadeklarował sekundy drogowe, ale wartości są znikome (< 1s dla punktów oddalonych o kilometry)
      if (
        options?.matrixCostUnit === 's' &&
        maxGeoDistanceKm > 1.0 &&
        maxMatrixVal < 1.0
      ) {
        throw new Error(
          `optimizeDayRouteWithHotel: Wykryto rozbieżność rzędu wielkości kosztów. Zadeklarowano czas w sekundach ("s"), ale wartości w macierzy (maksimum: ${maxMatrixVal}) są znikome dla punktów oddalonych o ${maxGeoDistanceKm.toFixed(
            1
          )} km. Prawdopodobnie przekazano odległości w kilometrach jako sekundy.`
        );
      }
    }
  }

  // Rygorystyczne wyznaczenie jednostek:
  // Jeśli brak poprawnej macierzy drogowej, bezwzględnie wymuszamy isApproximate=true, costUnit='km', effectiveCriterion='distance'
  // Parametr options.isApproximate === false nie może wymusić trybu dokładnego, jeśli brakuje macierzy drogowej!
  const isApproximate = !hasValidCustomMatrix ? true : (options?.isApproximate ?? false);
  const effectiveCriterion: OptimizationCriterion = !hasValidCustomMatrix || isApproximate
    ? 'distance'
    : (options?.criterion || 'duration');
  const costUnit: 's' | 'm' | 'km' = !hasValidCustomMatrix || isApproximate
    ? 'km'
    : (options?.matrixCostUnit ?? (effectiveCriterion === 'duration' ? 's' : 'm'));

  // Decyzja czy używamy customMatrix: TYLKO jeśli macierz jest poprawna I nie jesteśmy w trybie przybliżonym
  const shouldUseCustomMatrix = hasValidCustomMatrix && !isApproximate;
  const routeStatus: 'road_confirmed' | 'straight_line_estimate' =
    shouldUseCustomMatrix ? 'road_confirmed' : 'straight_line_estimate';

  // 1. Pusty dzień (brak atrakcji)
  if (attractions.length === 0) {
    return {
      orderedAttractions: [],
      fullTour: hasHotel ? [hotel!, hotel!] : [],
      totalCost: 0,
      outboundCost: 0,
      attractionsCost: 0,
      returnCost: 0,
      hasHotel,
      costUnit,
      isApproximate,
      effectiveCriterion,
      routeStatus: 'straight_line_estimate',
    };
  }

  // 2. Dzień z jedną atrakcją
  if (attractions.length === 1) {
    if (!hasHotel) {
      return {
        orderedAttractions: [attractions[0]],
        fullTour: [attractions[0]],
        totalCost: 0,
        outboundCost: 0,
        attractionsCost: 0,
        returnCost: 0,
        hasHotel: false,
        costUnit,
        isApproximate,
        effectiveCriterion,
        routeStatus: 'straight_line_estimate',
      };
    }

    let outbound = 0;
    let ret = 0;
    if (shouldUseCustomMatrix) {
      outbound = options!.matrix![0][1];
      ret = options!.matrix![1][0];
    } else {
      outbound = haversineDistance(hotel!.lat, hotel!.lon, attractions[0].lat, attractions[0].lon);
      ret = haversineDistance(attractions[0].lat, attractions[0].lon, hotel!.lat, hotel!.lon);
    }
    const total = outbound + ret;
    return {
      orderedAttractions: [attractions[0]],
      fullTour: [hotel!, attractions[0], hotel!],
      totalCost: Number(total.toFixed(2)),
      outboundCost: Number(outbound.toFixed(2)),
      attractionsCost: 0,
      returnCost: Number(ret.toFixed(2)),
      hasHotel: true,
      costUnit,
      isApproximate,
      effectiveCriterion,
      routeStatus,
    };
  }

  // 3. Wiele atrakcji bez hotelu (otwarta ścieżka Hamiltona)
  if (!hasHotel) {
    const tsp = optimizeSightseeingRoute(
      attractions,
      false,
      shouldUseCustomMatrix
        ? { customMatrix: options!.matrix!, criterion: effectiveCriterion, isApproximate: false }
        : undefined,
      effectiveCriterion,
      isApproximate
    );
    const cost = tsp.optimizedCost ?? tsp.optimizedDistanceKm;
    return {
      orderedAttractions: tsp.orderedPoints,
      fullTour: tsp.orderedPoints,
      totalCost: cost,
      outboundCost: 0,
      attractionsCost: cost,
      returnCost: 0,
      hasHotel: false,
      costUnit,
      isApproximate,
      effectiveCriterion,
      routeStatus,
    };
  }

  // 4. Wiele atrakcji Z HOTELEM (Fixed Depot Closed TSP: Hotel -> A_pi(1) -> ... -> A_pi(K) -> Hotel)
  const allNodes: GeoPoint[] = [hotel!, ...attractions];
  const costMatrix: number[][] = shouldUseCustomMatrix
    ? options!.matrix!
    : buildDistanceMatrix(allNodes);

  // Funkcja kosztu pełnego cyklu: 0 -> perm[0] -> ... -> perm[K-1] -> 0
  const evaluateTour = (perm: number[]): { total: number; outbound: number; attr: number; ret: number } => {
    const outbound = costMatrix[0][perm[0]];
    let attr = 0;
    for (let i = 0; i < perm.length - 1; i++) {
      attr += costMatrix[perm[i]][perm[i + 1]];
    }
    const ret = costMatrix[perm[perm.length - 1]][0];
    return {
      total: outbound + attr + ret,
      outbound,
      attr,
      ret,
    };
  };

  let bestPerm: number[] = Array.from({ length: K }, (_, i) => i + 1);
  let bestEval = evaluateTour(bestPerm);

  if (K <= 7) {
    // Brute Force: przeszukuje wszystkie K! permutacji (max 5040, < 2ms)
    const permute = (arr: number[], m: number[] = []) => {
      if (arr.length === 0) {
        const ev = evaluateTour(m);
        if (ev.total < bestEval.total - 1e-9) {
          bestEval = ev;
          bestPerm = [...m];
        }
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };
    permute(Array.from({ length: K }, (_, i) => i + 1));
  } else {
    // Heurystyka 2-Opt i Relocate na cyklu zamkniętym
    const unvisited = new Set(Array.from({ length: K }, (_, i) => i + 1));
    let current = 0;
    const greedyPerm: number[] = [];
    while (unvisited.size > 0) {
      let nearest = -1;
      let minDist = Infinity;
      for (const cand of unvisited) {
        const d = costMatrix[current][cand];
        if (d < minDist) {
          minDist = d;
          nearest = cand;
        }
      }
      greedyPerm.push(nearest);
      unvisited.delete(nearest);
      current = nearest;
    }
    bestPerm = greedyPerm;
    bestEval = evaluateTour(bestPerm);

    let improved = true;
    let iters = 0;
    while (improved && iters < 300) {
      improved = false;
      iters++;

      // 2-Opt odwrócenie
      for (let i = 0; i < K - 1; i++) {
        for (let j = i + 1; j < K; j++) {
          const cand = [
            ...bestPerm.slice(0, i),
            ...bestPerm.slice(i, j + 1).reverse(),
            ...bestPerm.slice(j + 1),
          ];
          const ev = evaluateTour(cand);
          if (ev.total < bestEval.total - 1e-9) {
            bestPerm = cand;
            bestEval = ev;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }

      // Relocate przesunięcie
      if (!improved) {
        for (let i = 0; i < K; i++) {
          for (let targetPos = 0; targetPos < K; targetPos++) {
            if (targetPos === i) continue;
            const cand = applyRelocateMove(bestPerm, i, targetPos);
            const ev = evaluateTour(cand);
            if (ev.total < bestEval.total - 1e-9) {
              bestPerm = cand;
              bestEval = ev;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
    }
  }

  const orderedAttractions = bestPerm.map((nodeIdx) => attractions[nodeIdx - 1]);
  const fullTour = [hotel!, ...orderedAttractions, hotel!];

  return {
    orderedAttractions,
    fullTour,
    totalCost: Number(bestEval.total.toFixed(2)),
    outboundCost: Number(bestEval.outbound.toFixed(2)),
    attractionsCost: Number(bestEval.attr.toFixed(2)),
    returnCost: Number(bestEval.ret.toFixed(2)),
    hasHotel: true,
    costUnit,
    isApproximate,
    effectiveCriterion,
    routeStatus,
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
  'kazimierz dolny': { lat: 51.3235, lon: 21.9547 },
  'żelazowa wola': { lat: 52.2570, lon: 20.3160 },
  'zelazowa wola': { lat: 52.2570, lon: 20.3160 },
  'płock': { lat: 52.5463, lon: 19.7065 },
  'plock': { lat: 52.5463, lon: 19.7065 },
  'ojców': { lat: 50.2150, lon: 19.8310 },
  'ojcow': { lat: 50.2150, lon: 19.8310 },
  'malbork': { lat: 54.0359, lon: 19.0266 },
  'podzamcze': { lat: 50.4530, lon: 19.5530 },

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
 * Wyznacza deterministyczny, niewielki offset współrzędnych (rozproszenie)
 * dla punktów bez precyzyjnych koordynatów GPS wokół centrum miasta / noclegu.
 * Zapobiega nakładaniu się punktów w odległości 0m i kolapsowi algorytmu TSP 2-Opt.
 */
export const getDeterministicCoordinateOffset = (title: string): { latOffset: number; lonOffset: number } => {
  let hash = 0;
  const str = (title || '').trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  // Promień rozproszenia: 350m - 1200m wokół centrum miasta
  const radiusKm = 0.35 + (Math.abs(hash >> 3) % 850) / 1000;
  const latOffset = (radiusKm / 111.0) * Math.sin(angle);
  const lonOffset = (radiusKm / (111.0 * 0.7)) * Math.cos(angle);
  return { latOffset, lonOffset };
};

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
    if (
      !p.name ||
      typeof p.lat !== 'number' ||
      typeof p.lon !== 'number' ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon)
    ) {
      return false;
    }
    const cleanPoolName = normalizeAttractionTitle(p.name);
    return cleanPoolName === cleanTitle || cleanTitle.includes(cleanPoolName) || cleanPoolName.includes(cleanTitle);
  });
  if (foundInPool && typeof foundInPool.lat === 'number' && typeof foundInPool.lon === 'number') {
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

  // Obliczamy deterministyczny offset (dyspersję) wokół centrum miasta / noclegu,
  // aby zapobiec nakładaniu się punktów w odległości 0 metrów i kolapsowi macierzy TSP.
  // UWAGA: Nigdy nie zapisujemy tych szacunkowych koordynatów do GEOCODE_CACHE, aby umożliwić
  // asynchroniczne pobranie prawdziwych współrzędnych z Google Places!
  const offset = getDeterministicCoordinateOffset(cleanTitle);
  return {
    lat: Number((baseCoords.lat + offset.latOffset).toFixed(6)),
    lon: Number((baseCoords.lon + offset.lonOffset).toFixed(6)),
  };
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
    if (
      !p.name ||
      typeof p.lat !== 'number' ||
      typeof p.lon !== 'number' ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon)
    ) {
      return false;
    }
    const cleanPoolName = normalizeAttractionTitle(p.name);
    return cleanPoolName === cleanTitle || cleanTitle.includes(cleanPoolName) || cleanPoolName.includes(cleanTitle);
  });
  if (foundInPool && typeof foundInPool.lat === 'number' && typeof foundInPool.lon === 'number') {
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

  const apiKey = getGoogleApiKey();
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
  transitNotice?: string;
  isLongWalk?: boolean;
  isTransitEstimated?: boolean;
}

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
      isLongWalk: false,
      isTransitEstimated: true,
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
  // - Krótki dystans (<= 1.5 km i czas marszu <= 22 min): spacer jest racjonalny i rekomendowany.
  // - Długi dystans (> 1.5 km lub czas marszu > 22 min, np. marsz 1.5 godziny przez miasto):
  //   Aplikacja NIE REKOMENDUJE spaceru! Rekomenduje komunikację miejską / taxi,
  //   z wyraźną informacją o konieczności sprawdzenia rozkładu na żywo w Mapach Google.
  const isLongWalk = walkDistanceKm > 1.5 || walkMinutes > 22;
  const recommendedMode: 'walking' | 'transit' | 'driving' =
    isLongWalk ? 'transit' : 'walking';

  const transitNotice = isLongWalk
    ? 'Dłuższy odcinek — zalecana komunikacja miejska lub taxi. Sprawdź rozkład na żywo w Mapach Google.'
    : undefined;

  return {
    walkMinutes,
    walkDistanceKm,
    transitMinutes,
    driveMinutes,
    driveDistanceKm,
    straightDistanceKm: Number(straightDist.toFixed(2)),
    recommendedMode,
    transitNotice,
    isLongWalk,
    isTransitEstimated: true,
  };
};

export interface StreetRouteInfo extends TransitLegEstimate {}

export const ROUTE_INFO_CACHE = new Map<string, StreetRouteInfo>();

export interface FetchRealRouteInfoOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export const IN_FLIGHT_ROUTE_INFO_REQUESTS = new Map<string, Promise<StreetRouteInfo>>();

export const clearInFlightRouteInfoRequests = (): void => {
  IN_FLIGHT_ROUTE_INFO_REQUESTS.clear();
};

/**
 * Pobiera rzeczywiste dane drogowe i piesze z serwerów OSRM z automatycznym
 * dopasowaniem do czasów z Google Maps (uwzględnia światła, ruch miejski i przystanki).
 * Posiada wbudowany timeout, deduplikację żądań równoległych i obsługę AbortSignal.
 */
export const fetchRealRouteInfo = async (
  p1: { lat: number; lon: number },
  p2: { lat: number; lon: number },
  options?: FetchRealRouteInfoOptions
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

  if (IN_FLIGHT_ROUTE_INFO_REQUESTS.has(cacheKey)) {
    return IN_FLIGHT_ROUTE_INFO_REQUESTS.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const timeoutMs = options?.timeoutMs ?? 3500;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      let customWalkDistKm: number | undefined;
      let customWalkDurationMins: number | undefined;
      let customDriveDistKm: number | undefined;
      let customDriveDurationMins: number | undefined;

      const footUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;
      const driveUrl = `https://router.project-osrm.org/route/v1/driving/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;

      const [footRes, driveRes] = await Promise.allSettled([
        fetch(footUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'DestivoApp/1.0' },
        }).then((r) => (r.ok ? r.json() : null)),
        fetch(driveUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'DestivoApp/1.0' },
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (footRes.status === 'fulfilled' && footRes.value?.routes?.length > 0) {
        const route = footRes.value.routes[0];
        if (typeof route.distance === 'number') {
          customWalkDistKm = Number((route.distance / 1000).toFixed(1));
        }
        if (typeof route.duration === 'number') {
          customWalkDurationMins = route.duration / 60;
        }
      }

      if (driveRes.status === 'fulfilled' && driveRes.value?.routes?.length > 0) {
        const route = driveRes.value.routes[0];
        if (typeof route.distance === 'number') {
          customDriveDistKm = Number((route.distance / 1000).toFixed(1));
        }
        if (typeof route.duration === 'number') {
          customDriveDurationMins = route.duration / 60;
        }
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
    } catch {
      ROUTE_INFO_CACHE.set(cacheKey, baseEstimate);
      return baseEstimate;
    } finally {
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      IN_FLIGHT_ROUTE_INFO_REQUESTS.delete(cacheKey);
    }
  })();

  IN_FLIGHT_ROUTE_INFO_REQUESTS.set(cacheKey, fetchPromise);
  return fetchPromise;
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
 * Buduje link nawigacji w Google Maps do danego punktu docelowego z bieżącej lokalizacji użytkownika.
 * Brak parametru 'origin' sprawia, że Google Maps automatycznie używa aktualnej pozycji GPS telefonu.
 */
export const buildGoogleMapsNavigationToDestinationUrl = (
  destination: { lat?: number; lon?: number; title?: string; subtitle?: string },
  city?: string,
  mode?: 'walking' | 'transit' | 'driving'
): string => {
  const cleanCity = city?.trim() || '';
  const rawTitle = destination.title?.trim() || '';
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

  let destParam = '';
  if (
    isLodging &&
    destination.subtitle &&
    destination.subtitle.trim() &&
    !destination.subtitle.toLowerCase().includes('zwiedzanie') &&
    !destination.subtitle.toLowerCase().includes('rekomendowane')
  ) {
    const address = destination.subtitle.trim();
    destParam = cleanCity && !address.toLowerCase().includes(cleanCity.toLowerCase())
      ? encodeURIComponent(`${address}, ${cleanCity}`)
      : encodeURIComponent(address);
  } else if (isTransitStation) {
    const isTrain = lower.includes('pociag') || lower.includes('kolej') || lower.includes('train') || lower.includes('station');
    destParam = cleanCity
      ? encodeURIComponent(isTrain ? `Central Station, ${cleanCity}` : `Airport, ${cleanCity}`)
      : encodeURIComponent(isTrain ? 'Central Station' : 'Airport');
  } else if (destination.lat !== undefined && destination.lon !== undefined && !isNaN(destination.lat) && !isNaN(destination.lon)) {
    destParam = `${destination.lat},${destination.lon}`;
  } else {
    const cleanTitle = rawTitle.replace(/^(zwiedzanie|atrakcja)[\s:\-–—]+/i, '').trim();
    if (cleanCity && cleanTitle) {
      destParam = !cleanTitle.toLowerCase().includes(cleanCity.toLowerCase())
        ? encodeURIComponent(`${cleanTitle}, ${cleanCity}`)
        : encodeURIComponent(cleanTitle);
    } else if (cleanTitle) {
      destParam = encodeURIComponent(cleanTitle);
    } else {
      destParam = encodeURIComponent(cleanCity || 'City Center');
    }
  }

  const modeParam = mode ? `&travelmode=${mode}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destParam}${modeParam}`;
};

/**
 * Buduje link do Google Maps z pełną trasą i wszystkimi kolejnymi przystankami (waypoints).
 * Ustawia kolejno pierwszy punkt jako start (origin), ostatni jako cel (destination),
 * a wszystkie pośrednie punkty zwiedzania jako przystanki (waypoints).
 * Odfiltrowuje punkty noclegowe bez podanego fizycznego adresu, zapobiegając fałszywym trasom.
 */
export const buildGoogleMapsFullRouteUrl = (
  rawPoints: Array<{ lat?: number; lon?: number; title?: string; subtitle?: string }>,
  city?: string
): string => {
  if (!rawPoints || rawPoints.length === 0) return 'https://www.google.com/maps';
  const cleanCity = city?.trim() || '';

  // Wykluczamy noclegi, które nie mają faktycznego adresu (żeby nie nawigować do fikcyjnego centrum)
  const points = rawPoints.filter((p) => {
    const rawTitle = (p.title || '').trim().toLowerCase();
    const isLodging =
      rawTitle.includes('zameldowanie') ||
      rawTitle.includes('check-in') ||
      rawTitle.includes('check in') ||
      rawTitle.includes('lodging') ||
      rawTitle.includes('hotel');
    if (isLodging) {
      const sub = (p.subtitle || '').trim().toLowerCase();
      const isMissingAddress =
        !sub ||
        ['ok', 'brak', 'none', '-'].includes(sub) ||
        sub.includes('zwiedzanie') ||
        sub.includes('rekomendowane');
      return !isMissingAddress;
    }
    return true;
  });

  const effectivePoints = points.length > 0 ? points : rawPoints;

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

    if (p.lat !== undefined && p.lon !== undefined && !isNaN(p.lat) && !isNaN(p.lon)) {
      return `${p.lat},${p.lon}`;
    }

    if (cleanTitle) {
      return encodeURIComponent(cleanTitle);
    }

    return encodeURIComponent(cleanCity || 'City Center');
  };

  if (effectivePoints.length === 1) {
    const singleParam = formatPt(effectivePoints[0]);
    return `https://www.google.com/maps/search/?api=1&query=${singleParam}`;
  }

  const originParam = formatPt(effectivePoints[0]);
  const destParam = formatPt(effectivePoints[effectivePoints.length - 1]);

  // Google Maps Universal URL obsługuje do 9 przystanków pośrednich (waypoints)
  const waypoints = effectivePoints
    .slice(1, effectivePoints.length - 1)
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

export const isLodgingEvent = (e?: { type?: string; title?: string } | null): boolean => {
  if (!e) return false;
  if (e.type === 'LODGING') return true;
  const raw = (e.title || '').trim().toLowerCase();
  return (
    raw.includes('zameldowanie') ||
    raw.includes('nocleg') ||
    raw.includes('hotel') ||
    raw.includes('check-in') ||
    raw.includes('check in')
  );
};

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

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isDayInPast = (dStr?: string): boolean => {
    if (!dStr || !dStr.trim()) return false;
    const parsed = parseTimelineDate(dStr, '23:59');
    return parsed.getTime() < todayMidnight;
  };

  const isToday = (dStr?: string): boolean => {
    if (!dStr || !dStr.trim()) return false;
    const parsed = parseTimelineDate(dStr, '00:00');
    return (
      parsed.getFullYear() === now.getFullYear() &&
      parsed.getMonth() === now.getMonth() &&
      parsed.getDate() === now.getDate()
    );
  };


  /**
   * Sprawdza realtime czy na danym dniu jest jeszcze sens dodawać nową atrakcję turystyczną,
   * czy dzień jest już w praktyce zakończony pod kątem zwiedzania (np. wieczór po 18:00,
   * minęły już wszystkie atrakcje i pozostał wyłącznie nocleg / powrót, lub za mało czasu na zwiedzanie).
   */
  const isDayExhaustedForSightseeing = (dStr?: string): boolean => {
    if (!dStr || !dStr.trim()) return true;
    if (isDayInPast(dStr)) return true;

    const dayEvts = events.filter((e) => e.dateStr === dStr);
    if (dayEvts.length === 0) return false;

    // Punkty na tym dniu
    const upcomingEvents = isToday(dStr)
      ? dayEvts.filter((e) => {
          if (e.isPast) return false;
          if (e.timeStr && timeStrToMinutes(e.timeStr) <= nowMinutes) return false;
          return true;
        })
      : dayEvts;

    // Jeśli na tym dniu nie ma już żadnych przyszłych punktów -> dzień zakończony
    if (upcomingEvents.length === 0) {
      return true;
    }

    // Jeśli dzisiaj jest po 18:00 -> za późno na nowe zwiedzanie
    if (isToday(dStr) && nowMinutes >= 18 * 60) {
      return true;
    }

    // KRYTYCZNY WARUNEK: Jeśli na tym dniu jedynym punktem jaki pozostał jest NOCLEG lub POWRÓT (zero pozostałych atrakcji)
    const remainingAttractions = upcomingEvents.filter((e) => e.type === 'ATTRACTION');
    if (remainingAttractions.length === 0) {
      const lodgingEvt = upcomingEvents.find((e) => isLodgingEvent(e) || e.type === 'RETURN');
      if (lodgingEvt) {
        if (isToday(dStr)) {
          const hadSightseeingFinished = dayEvts.some(
            (e) => e.type === 'ATTRACTION' && (e.isPast || (e.timeStr && timeStrToMinutes(e.timeStr) <= nowMinutes))
          );
          const lodgingM = lodgingEvt.timeStr ? timeStrToMinutes(lodgingEvt.timeStr) : 20 * 60;
          if (hadSightseeingFinished || nowMinutes >= 16 * 60 + 30 || (lodgingM - nowMinutes) < 120) {
            return true;
          }
        } else {
          // Dla dnia przyszłego: jeśli na danym dniu zaplanowano wyłącznie nocleg lub powrót
          if (upcomingEvents.length === 1) {
            return true;
          }
        }
      }
    }

    return false;
  };

  const allDates = Array.from(
    new Set(events.map((e) => e.dateStr).filter((d): d is string => Boolean(d && d.trim())))
  );

  const futureDates = allDates.filter((d) => !isDayInPast(d));
  // Preferujemy dni, które nie są wyczerpane na zwiedzanie
  const viableSightseeingDates = futureDates.filter((d) => !isDayExhaustedForSightseeing(d));
  const candidateDates =
    viableSightseeingDates.length > 0
      ? viableSightseeingDates
      : futureDates.length > 0
      ? futureDates
      : allDates;

  const fallbackDateStr =
    candidateDates.length > 0
      ? candidateDates[0]
      : defaultDateStr || (events.length > 0 ? events[0].dateStr : '01-01-2026');

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

  // 1. Określamy wybrany dzień docelowy (targetDateStr):
  let targetDateStr: string = candidateDates.length > 0 ? candidateDates[0] : fallbackDateStr;

  if (defaultDateStr && defaultDateStr.trim()) {
    const cleanDefault = defaultDateStr.trim();
    const isExhausted = isDayExhaustedForSightseeing(cleanDefault);
    const hasNextDay = allDates.some(
      (d) => parseTimelineDate(d, '00:00').getTime() > parseTimelineDate(cleanDefault, '00:00').getTime()
    );

    // Używamy cleanDefault tylko wtedy, gdy dzień nie minął i NIE jest wyczerpany na zwiedzanie (lub nie ma kolejnego dnia w podróży)
    if (!isDayInPast(cleanDefault) && (!isExhausted || !hasNextDay)) {
      targetDateStr = cleanDefault;
    } else {
      // cleanDefault minął lub został tylko nocleg/wieczór! Szukamy najbliższego dnia przyszłego w candidateDates
      const laterCandidate = candidateDates.find(
        (d) => parseTimelineDate(d, '00:00').getTime() > parseTimelineDate(cleanDefault, '00:00').getTime()
      );
      if (laterCandidate) {
        targetDateStr = laterCandidate;
      } else if (candidateDates.length > 0) {
        targetDateStr = candidateDates[0];
      }
    }
  } else {
    // Brak podanego defaultDateStr: wybieramy dzień mający punkt leżący najbliżej geograficznie
    const eligibleEvents = events.filter((e) => candidateDates.includes(e.dateStr));
    if (eligibleEvents.length > 0) {
      let closestDist = Infinity;
      let closestEvtDate = candidateDates[0];
      for (const ev of eligibleEvents) {
        const c = getEventCoords(ev);
        const d = haversineDistance(c.lat, c.lon, targetLat, targetLon);
        if (d < closestDist) {
          closestDist = d;
          closestEvtDate = ev.dateStr;
        }
      }
      targetDateStr = closestEvtDate;
    }
  }

  // 2. Znajdujemy optymalne miejsce ("jak najbardziej po drodze") na wybranym dniu:
  let dayIndices = events
    .map((e, idx) => ({ e, idx }))
    .filter((x) => x.e.dateStr === targetDateStr);

  let targetIsToday = isToday(targetDateStr);

  // KRYTYCZNA OCHRONA: Sprawdzamy czy na tym dniu jest nocleg lub powrót
  let dayLodging = dayIndices.find((item) => isLodgingEvent(item.e));
  let dayReturn = dayIndices.find((item) => item.e.type === 'RETURN');

  let maxAllowedSlotOnDay = maxIdx;
  if (dayReturn) {
    maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayReturn.idx);
  }
  if (dayLodging) {
    // Atrakcja NIGDY nie może być po noclegu na tym samym dniu!
    maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayLodging.idx);
  }
  if (!dayLodging && !dayReturn && dayIndices.length > 0) {
    maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayIndices[dayIndices.length - 1].idx + 1);
  }

  let minAllowedSlotOnDay = minIdx;
  if (dayIndices.length > 0) {
    minAllowedSlotOnDay = Math.max(minIdx, dayIndices[0].idx);
    const dayDeparture = dayIndices.find((item) => item.e.type === 'DEPARTURE');
    if (dayDeparture) {
      minAllowedSlotOnDay = Math.max(minAllowedSlotOnDay, dayDeparture.idx + 1);
    }
    const dayArrival = dayIndices.find((item) => item.e.type === 'ARRIVAL');
    if (dayArrival) {
      minAllowedSlotOnDay = Math.max(minAllowedSlotOnDay, dayArrival.idx + 1);
    }
  }

  // Nigdy nie wstawiamy przed minionymi wydarzeniami dzisiaj!
  if (targetIsToday) {
    for (const item of dayIndices) {
      const itemM = item.e.timeStr ? timeStrToMinutes(item.e.timeStr) : 0;
      if (item.e.isPast || itemM <= nowMinutes) {
        if (item.idx + 1 > minAllowedSlotOnDay) {
          minAllowedSlotOnDay = item.idx + 1;
        }
      }
    }
  }

  // Jeśli na tym dniu nie ma już wolnego miejsca przed noclegiem (np. minęły wszystkie sloty dzisiaj i został tylko nocleg)
  if (minAllowedSlotOnDay > maxAllowedSlotOnDay) {
    const nextDayStr = allDates.find(
      (d) => parseTimelineDate(d, '00:00').getTime() > parseTimelineDate(targetDateStr, '00:00').getTime()
    );
    if (nextDayStr) {
      targetDateStr = nextDayStr;
      targetIsToday = isToday(targetDateStr);
      dayIndices = events
        .map((e, idx) => ({ e, idx }))
        .filter((x) => x.e.dateStr === targetDateStr);
      dayLodging = dayIndices.find((item) => isLodgingEvent(item.e));
      dayReturn = dayIndices.find((item) => item.e.type === 'RETURN');

      maxAllowedSlotOnDay = maxIdx;
      if (dayReturn) maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayReturn.idx);
      if (dayLodging) maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayLodging.idx);
      if (!dayLodging && !dayReturn && dayIndices.length > 0) {
        maxAllowedSlotOnDay = Math.min(maxAllowedSlotOnDay, dayIndices[dayIndices.length - 1].idx + 1);
      }

      minAllowedSlotOnDay = minIdx;
      if (dayIndices.length > 0) {
        minAllowedSlotOnDay = Math.max(minIdx, dayIndices[0].idx);
        const dayDeparture = dayIndices.find((item) => item.e.type === 'DEPARTURE');
        if (dayDeparture) minAllowedSlotOnDay = Math.max(minAllowedSlotOnDay, dayDeparture.idx + 1);
        const dayArrival = dayIndices.find((item) => item.e.type === 'ARRIVAL');
        if (dayArrival) minAllowedSlotOnDay = Math.max(minAllowedSlotOnDay, dayArrival.idx + 1);
      }
    }
  }

  const startSlot = Math.min(maxIdx, minAllowedSlotOnDay);
  const endSlot = Math.min(maxIdx, maxAllowedSlotOnDay);

  let bestSlot = startSlot;

  if (startSlot <= endSlot && dayIndices.length > 0) {
    let minDetour = Infinity;

    for (let slot = startSlot; slot <= endSlot; slot++) {
      const prevEvt = slot > 0 ? events[slot - 1] : null;
      const nextEvt = slot < events.length ? events[slot] : null;

      let detour = 0;
      if (prevEvt && nextEvt) {
        const pCoords = getEventCoords(prevEvt);
        const nCoords = getEventCoords(nextEvt);
        const dPrevTarget = haversineDistance(pCoords.lat, pCoords.lon, targetLat, targetLon);
        const dTargetNext = haversineDistance(targetLat, targetLon, nCoords.lat, nCoords.lon);
        const dPrevNext = haversineDistance(pCoords.lat, pCoords.lon, nCoords.lat, nCoords.lon);
        detour = dPrevTarget + dTargetNext - dPrevNext;
      } else if (prevEvt) {
        const pCoords = getEventCoords(prevEvt);
        detour = haversineDistance(pCoords.lat, pCoords.lon, targetLat, targetLon);
      } else if (nextEvt) {
        const nCoords = getEventCoords(nextEvt);
        detour = haversineDistance(targetLat, targetLon, nCoords.lat, nCoords.lon);
      }

      if (detour < minDetour) {
        minDetour = detour;
        bestSlot = slot;
      }
    }
  } else {
    // Dzień docelowy nie ma jeszcze punktów lub slot jest wymuszony
    const pDate = parseTimelineDate(targetDateStr, '12:00');
    let chronologicalSlot = events.findIndex((e) => {
      const eDate = e.parsedDate || parseTimelineDate(e.dateStr, e.timeStr);
      return eDate.getTime() > pDate.getTime();
    });
    if (chronologicalSlot === -1) chronologicalSlot = events.length;
    bestSlot = Math.max(minIdx, Math.min(maxIdx, chronologicalSlot));
  }

  // 3. Wyznaczamy optymalną godzinę wstawianego punktu na danym dniu
  const prevEvt = bestSlot > 0 ? events[bestSlot - 1] : null;
  const nextEvt = bestSlot < events.length ? events[bestSlot] : null;

  let targetTimeStr = '12:00';

  if (prevEvt && nextEvt && prevEvt.dateStr === targetDateStr && nextEvt.dateStr === targetDateStr) {
    const prevM = timeStrToMinutes(prevEvt.timeStr);
    const nextM = timeStrToMinutes(nextEvt.timeStr);
    if (nextM > prevM + 20) {
      targetTimeStr = minutesToTimeStr(Math.round((prevM + nextM) / 2));
    } else {
      targetTimeStr = minutesToTimeStr(Math.min(21 * 60, prevM + 45));
    }
  } else if (prevEvt && prevEvt.dateStr === targetDateStr) {
    const prevM = timeStrToMinutes(prevEvt.timeStr);
    targetTimeStr = minutesToTimeStr(Math.min(20 * 60, prevM + 60));
  } else if (nextEvt && nextEvt.dateStr === targetDateStr) {
    const nextM = timeStrToMinutes(nextEvt.timeStr);
    targetTimeStr = minutesToTimeStr(Math.max(10 * 60, nextM - 60));
  } else {
    targetTimeStr = '11:30';
  }

  // Jeśli wstawiamy przed noclegiem na tym samym dniu, godzina MUSI być przed noclegiem:
  if (nextEvt && isLodgingEvent(nextEvt) && nextEvt.dateStr === targetDateStr) {
    const lodgingM = timeStrToMinutes(nextEvt.timeStr || '20:00');
    if (timeStrToMinutes(targetTimeStr) >= lodgingM) {
      targetTimeStr = minutesToTimeStr(Math.max(10 * 60, lodgingM - 90));
    }
  }

  // Jeśli na tym dniu jest przyjazd do celu, godzina MUSI być po przyjeździe:
  const curDayArrival = dayIndices.find((item) => item.e.type === 'ARRIVAL');
  if (curDayArrival && curDayArrival.e.timeStr) {
    const arrM = timeStrToMinutes(curDayArrival.e.timeStr);
    if (timeStrToMinutes(targetTimeStr) < arrM + 30) {
      targetTimeStr = minutesToTimeStr(Math.min(22 * 60, arrM + 45));
    }
  } else {
    const curDayDep = dayIndices.find((item) => item.e.type === 'DEPARTURE');
    if (curDayDep && curDayDep.e.timeStr) {
      const depM = timeStrToMinutes(curDayDep.e.timeStr);
      if (timeStrToMinutes(targetTimeStr) < depM + 60) {
        targetTimeStr = minutesToTimeStr(Math.min(22 * 60, depM + 90));
      }
    }
  }

  // Jeśli na tym dniu jest powrót (RETURN), godzina MUSI być przed powrotem:
  if (dayReturn && dayReturn.e.timeStr) {
    const retM = timeStrToMinutes(dayReturn.e.timeStr);
    if (timeStrToMinutes(targetTimeStr) > retM - 45) {
      targetTimeStr = minutesToTimeStr(Math.max(8 * 60, retM - 60));
    }
  }

  // KRYTYCZNA OCHRONA: Jeśli to dzisiaj, godzina NIE MOŻE być w przeszłości
  if (targetIsToday) {
    const minSafeFutureMinutes = Math.min(22 * 60, Math.max(nowMinutes + 20, 9 * 60));
    if (timeStrToMinutes(targetTimeStr) < minSafeFutureMinutes) {
      targetTimeStr = minutesToTimeStr(minSafeFutureMinutes);
    }
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
  const isCandidateFromPool = Boolean((newEventData as any).isFromPool);
  const hasCustomDate = !isCandidateFromPool && Boolean(newEventData.dateStr && newEventData.dateStr.trim());
  const hasCustomTime = !isCandidateFromPool && Boolean(newEventData.timeStr && newEventData.timeStr.trim());

  let insertion: IntelligentInsertionResult;
  if (hasCustomDate && hasCustomTime) {
    let pDate = parseTimelineDate(newEventData.dateStr!, newEventData.timeStr!);
    let slot = events.findIndex((e) => {
      const eDate = e.parsedDate || parseTimelineDate(e.dateStr, e.timeStr);
      return eDate.getTime() > pDate.getTime();
    });
    if (slot === -1) slot = events.length;

    const dayIndices = events
      .map((e, idx) => ({ e, idx }))
      .filter((x) => x.e.dateStr === newEventData.dateStr);
    const dayLodging = dayIndices.find((item) => isLodgingEvent(item.e));
    const dayReturn = dayIndices.find((item) => item.e.type === 'RETURN');
    const dayArrival = dayIndices.find((item) => item.e.type === 'ARRIVAL');
    const dayDeparture = dayIndices.find((item) => item.e.type === 'DEPARTURE');

    let minIdx = 0;
    if (dayArrival) minIdx = dayArrival.idx + 1;
    else if (dayDeparture) minIdx = dayDeparture.idx + 1;
    else if (events.length > 0 && events[0].type === 'DEPARTURE') minIdx = 1;

    let maxIdx = events.length;
    if (dayReturn) maxIdx = dayReturn.idx;
    else if (dayLodging) maxIdx = dayLodging.idx;
    else if (events.length > 0 && events[events.length - 1].type === 'RETURN') maxIdx = events.length - 1;

    let finalSlot = Math.max(minIdx, Math.min(maxIdx, slot));
    let finalTimeStr = newEventData.timeStr!;

    // KRYTYCZNA OCHRONA:
    // 1. Nawet przy podaniu ręcznym atrakcja NIE MOŻE być po noclegu na tym samym dniu!
    if (dayLodging && finalSlot > dayLodging.idx) {
      finalSlot = dayLodging.idx;
      const lodgingM = dayLodging.e.timeStr ? timeStrToMinutes(dayLodging.e.timeStr) : 20 * 60;
      finalTimeStr = minutesToTimeStr(Math.max(9 * 60, lodgingM - 90));
      pDate = parseTimelineDate(newEventData.dateStr!, finalTimeStr);
    }
    // 2. Atrakcja NIE MOŻE być po powrocie z podróży!
    if (dayReturn && finalSlot >= dayReturn.idx) {
      finalSlot = dayReturn.idx;
      const returnM = dayReturn.e.timeStr ? timeStrToMinutes(dayReturn.e.timeStr) : 18 * 60;
      finalTimeStr = minutesToTimeStr(Math.max(8 * 60, returnM - 60));
      pDate = parseTimelineDate(newEventData.dateStr!, finalTimeStr);
    }
    // 3. Atrakcja NIE MOŻE być przed przyjazdem do celu!
    if (dayArrival && (finalSlot <= dayArrival.idx || timeStrToMinutes(finalTimeStr) < timeStrToMinutes(dayArrival.e.timeStr) + 30)) {
      finalSlot = Math.max(dayArrival.idx + 1, finalSlot);
      const arrM = dayArrival.e.timeStr ? timeStrToMinutes(dayArrival.e.timeStr) : 11 * 60;
      finalTimeStr = minutesToTimeStr(Math.min(22 * 60, arrM + 45));
      pDate = parseTimelineDate(newEventData.dateStr!, finalTimeStr);
    } else if (dayDeparture && (finalSlot <= dayDeparture.idx || timeStrToMinutes(finalTimeStr) < timeStrToMinutes(dayDeparture.e.timeStr) + 45)) {
      finalSlot = Math.max(dayDeparture.idx + 1, finalSlot);
      const depM = dayDeparture.e.timeStr ? timeStrToMinutes(dayDeparture.e.timeStr) : 8 * 60;
      finalTimeStr = minutesToTimeStr(Math.min(22 * 60, depM + 90));
      pDate = parseTimelineDate(newEventData.dateStr!, finalTimeStr);
    }

    insertion = {
      insertIndex: finalSlot,
      dateStr: newEventData.dateStr!,
      timeStr: finalTimeStr,
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

  // KRYTYCZNY INWARIANT:
  // 1. Żadna atrakcja (ATTRACTION) na danym dniu NIE MOŻE znajdować się po noclegu ani po powrocie!
  // 2. Żadna atrakcja (ATTRACTION) na danym dniu NIE MOŻE znajdować się przed przyjazdem ani przed odjazdem!
  const allUniqueDates = Array.from(
    new Set(result.map((e) => e.dateStr).filter((d): d is string => Boolean(d && d.trim())))
  );

  for (let i = 0; i < result.length; i++) {
    const cur = result[i];
    if (isLodgingEvent(cur)) {
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].dateStr === cur.dateStr && result[j].type === 'ATTRACTION') {
          const nextDay = allUniqueDates.find(
            (d) => parseTimelineDate(d, '00:00').getTime() > parseTimelineDate(cur.dateStr, '00:00').getTime()
          );
          if (nextDay) {
            result[j] = {
              ...result[j],
              dateStr: nextDay,
              timeStr: '11:00',
              parsedDate: parseTimelineDate(nextDay, '11:00'),
            };
          } else {
            const lodgingM = cur.timeStr ? timeStrToMinutes(cur.timeStr) : 20 * 60;
            const newM = Math.max(9 * 60, lodgingM - 60);
            const newT = minutesToTimeStr(newM);
            result[j] = {
              ...result[j],
              timeStr: newT,
              parsedDate: parseTimelineDate(cur.dateStr, newT),
            };
          }
        }
      }
    }
    if (cur.type === 'RETURN') {
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].dateStr === cur.dateStr && result[j].type === 'ATTRACTION') {
          const retM = cur.timeStr ? timeStrToMinutes(cur.timeStr) : 18 * 60;
          const newM = Math.max(8 * 60, retM - 60);
          const newT = minutesToTimeStr(newM);
          result[j] = {
            ...result[j],
            timeStr: newT,
            parsedDate: parseTimelineDate(cur.dateStr, newT),
          };
        }
      }
    }
    if (cur.type === 'ARRIVAL') {
      for (let j = 0; j < i; j++) {
        if (result[j].dateStr === cur.dateStr && result[j].type === 'ATTRACTION') {
          const arrM = cur.timeStr ? timeStrToMinutes(cur.timeStr) : 11 * 60;
          const newM = Math.min(22 * 60, arrM + 45);
          const newT = minutesToTimeStr(newM);
          result[j] = {
            ...result[j],
            timeStr: newT,
            parsedDate: parseTimelineDate(cur.dateStr, newT),
          };
        }
      }
    }
  }

  // Ostateczne sortowanie chronologiczne gwarantujące spójność całej osi
  result.sort((a, b) => {
    const timeA = (a.parsedDate || parseTimelineDate(a.dateStr, a.timeStr)).getTime();
    const timeB = (b.parsedDate || parseTimelineDate(b.dateStr, b.timeStr)).getTime();
    return timeA - timeB;
  });

  return result;
};

export interface SmartTimelineGenerationConfig {
  origin?: string;
  destination: string;
  startDate: string;
  endDate: string;
  transportType?: string;
  outboundDepartureTime?: string;
  outboundDepartureLocation?: string;
  outboundArrivalTime?: string;
  returnDepartureTime?: string;
  returnDepartureLocation?: string;
  returnArrivalTime?: string;
  lodgingAddress?: string;
  selectedAttractions: (string | { name?: string; title?: string; id?: string })[];
  poolAttractions?: { name: string; lat?: number; lon?: number; [key: string]: any }[];
  isDayTrip?: boolean;
  translations?: {
    departurePrefix?: string;
    arrivalPrefix?: string;
    returnPrefix?: string;
    departure?: string;
    arrival?: string;
    returnTrip?: string;
    lodging?: string;
    sightseeing?: string;
    home?: string;
  };
}

/**
 * Automatyczny generator inteligentnej, wielodniowej osi czasu.
 * - Wyznacza optymalną trasę geograficzną (TSP) dla wybranych atrakcji.
 * - Mądrze rozdziela atrakcje pomiędzy pełne dni podróży z naturalnymi przerwami.
 * - Ściśle respektuje godziny przyjazdu i odjazdu z formularza transportu.
 * - Gwarantuje brak jakichkolwiek emoji (wyłącznie ikony wektorowe).
 */
export const generateSmartMultiDayTimeline = (
  config: SmartTimelineGenerationConfig
): any[] => {
  const normDate = (dStr: string | null | undefined): string => {
    if (!dStr) return '';
    const clean = dStr.replace(/\./g, '-');
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
    return dStr;
  };

  const startNorm = normDate(config.startDate);
  const endNorm = normDate(config.endDate) || startNorm;

  const parseD = (dStr: string): Date => {
    const parts = normDate(dStr).split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return new Date();
  };

  const formatD = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const startD = parseD(startNorm);
  const endD = parseD(endNorm);

  const dayDates: string[] = [];
  const curD = new Date(startD);
  const maxSafetyDays = 30;
  let safety = 0;

  if (config.isDayTrip || curD.getTime() >= endD.getTime()) {
    dayDates.push(startNorm);
  } else {
    while (curD.getTime() <= endD.getTime() && safety < maxSafetyDays) {
      dayDates.push(formatD(curD));
      curD.setDate(curD.getDate() + 1);
      safety++;
    }
  }

  if (dayDates.length === 0) {
    dayDates.push(startNorm);
  }

  const totalDays = dayDates.length;
  const events: any[] = [];

  // 1. WYJAZD (DEPARTURE)
  const outboundTime = config.outboundDepartureTime || '08:00';
  const depTitle = config.translations?.departurePrefix
    ? config.translations.departurePrefix
        .replace('{{origin}}', config.origin || config.translations.home || 'Start')
        .replace('{{destination}}', config.destination)
    : `Wyjazd: ${config.origin || 'Start'} ➔ ${config.destination}`;
  const depSubtitle =
    config.outboundDepartureLocation ||
    config.translations?.departure ||
    (config.transportType ? `Podróż (${config.transportType.toUpperCase()})` : 'Rozpoczęcie podróży');

  events.push({
    id: 'evt_dep',
    type: 'DEPARTURE',
    title: depTitle,
    subtitle: depSubtitle,
    dateStr: dayDates[0],
    timeStr: outboundTime,
    parsedDate: parseTimelineDate(dayDates[0], outboundTime),
    isCompleted: false,
  });

  // 1b. PRZYJAZD DO CELU (ARRIVAL) - godzina z formularza transportu lub realistyczny czas po odjeździe
  const arrTime = config.outboundArrivalTime || (
    minutesToTimeStr(Math.min(22 * 60, timeStrToMinutes(outboundTime) + 150))
  );
  const arrTitle = config.translations?.arrivalPrefix
    ? config.translations.arrivalPrefix.replace('{{destination}}', config.destination)
    : `Przyjazd: ${config.destination}`;
  const arrSubtitle = config.translations?.arrival || 'Przyjazd do celu';

  events.push({
    id: 'evt_arrival',
    type: 'ARRIVAL',
    title: arrTitle,
    subtitle: arrSubtitle,
    dateStr: dayDates[0],
    timeStr: arrTime,
    parsedDate: parseTimelineDate(dayDates[0], arrTime),
    isCompleted: false,
  });

  // 2. ZAMELDOWANIE (LODGING) - Tylko 1. dnia po przyjeździe (bez spamu co noc)
  const rawAccom = (config.lodgingAddress || '').trim();
  const hasValidLodging =
    !config.isDayTrip &&
    rawAccom.length > 0 &&
    !['ok', 'brak', 'none', '-'].includes(rawAccom.toLowerCase());

  if (hasValidLodging) {
    const arrM = timeStrToMinutes(arrTime);
    const checkinM = Math.max(arrM + 30, Math.min(15 * 60, 14 * 60));
    const checkinTime = minutesToTimeStr(Math.min(22 * 60, checkinM));
    events.push({
      id: 'evt_lodging',
      type: 'LODGING',
      title: config.translations?.lodging || 'Zakwaterowanie',
      subtitle: rawAccom,
      dateStr: dayDates[0],
      timeStr: checkinTime,
      parsedDate: parseTimelineDate(dayDates[0], checkinTime),
      isCompleted: false,
    });
  }

  // 3. POWRÓT (RETURN) - Ostatniego dnia
  const returnTime =
    config.returnDepartureTime || (totalDays === 1 ? '19:00' : '17:00');
  const lastDateStr = dayDates[dayDates.length - 1];
  const retTitle = config.translations?.returnPrefix
    ? config.translations.returnPrefix
        .replace('{{destination}}', config.returnDepartureLocation || config.destination)
        .replace('{{origin}}', config.origin || config.translations.home || 'Koniec')
    : `Powrót: ${config.destination} ➔ ${config.origin || 'Koniec'}`;
  const retSubtitle =
    config.returnDepartureLocation ||
    config.translations?.returnTrip ||
    'Powrót do domu';

  const returnEvent = {
    id: 'evt_return',
    type: 'RETURN',
    title: retTitle,
    subtitle: retSubtitle,
    dateStr: lastDateStr,
    timeStr: returnTime,
    parsedDate: parseTimelineDate(lastDateStr, returnTime),
    isCompleted: false,
  };

  // 3b. ZAKOŃCZENIE PODRÓŻY / PRZYJAZD DO DOMU (END)
  if (config.returnArrivalTime) {
    events.push({
      id: 'evt_end',
      type: 'END',
      title: config.translations?.returnTrip || `Powrót: ${config.origin || 'Dom'}`,
      subtitle: config.translations?.home || 'Powrót do domu',
      dateStr: lastDateStr,
      timeStr: config.returnArrivalTime,
      parsedDate: parseTimelineDate(lastDateStr, config.returnArrivalTime),
      isCompleted: false,
    });
  }

  // 4. ATRAKCJE - AUTO-TSP I INTELIGENTNE ROZMIESZCZENIE PO DNIACH
  const rawAttractions = config.selectedAttractions || [];
  const attrNames: string[] = rawAttractions
    .map((a) => (typeof a === 'string' ? a : a.name || a.title || ''))
    .filter((n) => n && n.trim().length > 0);

  const pool = config.poolAttractions || [];
  const geoPoints: GeoPoint[] = attrNames.map((name, idx) => {
    const poolItem = pool.find(
      (p) => normalizeAttractionTitle(p.name || '') === normalizeAttractionTitle(name)
    );
    return {
      id: `attr_pt_${idx}`,
      title: name,
      lat: poolItem?.lat || 0,
      lon: poolItem?.lon || 0,
      originalIndex: idx,
    };
  });

  // Automatyczny TSP dla punktów ze współrzędnymi
  const validGeo = geoPoints.filter((p) => p.lat !== 0 && p.lon !== 0);
  let orderedNames = attrNames;

  if (validGeo.length >= 2) {
    try {
      const tsp = optimizeSightseeingRoute(validGeo, false);
      const tspOrderedNames = tsp.orderedPoints.map((p) => p.title);
      const remainder = attrNames.filter((n) => !tspOrderedNames.includes(n));
      orderedNames = [...tspOrderedNames, ...remainder];
    } catch {
      orderedNames = attrNames;
    }
  }

  const M = orderedNames.length;
  if (M > 0) {
    // Podział na dni
    const dayQuotas: number[] = new Array(totalDays).fill(0);

    if (totalDays === 1) {
      dayQuotas[0] = M;
    } else if (totalDays === 2) {
      const day1Q = M >= 3 ? Math.min(2, Math.floor(M / 2)) : Math.min(1, M);
      dayQuotas[0] = day1Q;
      dayQuotas[1] = M - day1Q;
    } else {
      // 3 lub więcej dni:
      // Dzień 1 (przylot): 0 lub 1 punkt (gdy dużo atrakcji)
      const day1Q = M >= 5 ? 1 : (M >= 8 ? 2 : 0);
      dayQuotas[0] = day1Q;

      // Ostatni dzień: 0 lub 1 poranny punkt
      const lastQ = (M - day1Q >= 4) ? 1 : 0;
      dayQuotas[totalDays - 1] = lastQ;

      // Środkowe dni
      const middleDaysCount = totalDays - 2;
      let remaining = M - day1Q - lastQ;

      for (let d = 1; d < totalDays - 1; d++) {
        const daysLeft = totalDays - 1 - d;
        const take = Math.ceil(remaining / daysLeft);
        dayQuotas[d] = take;
        remaining -= take;
      }
    }

    const arrivalM = timeStrToMinutes(arrTime);
    const earliestD1M = Math.min(22 * 60, arrivalM + 45);
    const returnM = timeStrToMinutes(returnTime);
    const latestDNM = Math.max(9 * 60, returnM - 60);

    let nameIndex = 0;
    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const quota = dayQuotas[dayIdx];
      if (quota === 0) continue;

      const dDateStr = dayDates[dayIdx];
      const isD1 = dayIdx === 0;
      const isDN = dayIdx === totalDays - 1;

      let slots: string[];
      if (isD1 && isDN) {
        slots = getTimeSlotsForDayAttractions(quota, true, true, earliestD1M, latestDNM);
      } else if (isD1) {
        slots = getTimeSlotsForDayAttractions(quota, true, false, earliestD1M, undefined);
      } else if (isDN) {
        slots = getTimeSlotsForDayAttractions(quota, false, true, undefined, latestDNM);
      } else {
        slots = getTimeSlotsForDayAttractions(quota, false, false);
      }

      for (let s = 0; s < quota && nameIndex < M; s++) {
        const attrName = orderedNames[nameIndex];
        const poolItem = pool.find(
          (p) => normalizeAttractionTitle(p.name || '') === normalizeAttractionTitle(attrName)
        );
        const slotTime = slots[s] || `${10 + s}:00`;

        events.push({
          id: `evt_attr_${dayIdx}_${s}_${Date.now()}_${nameIndex}`,
          type: 'ATTRACTION',
          title: attrName,
          subtitle: config.translations?.sightseeing || 'Zwiedzanie',
          dateStr: dDateStr,
          timeStr: slotTime,
          parsedDate: parseTimelineDate(dDateStr, slotTime),
          lat: poolItem?.lat,
          lon: poolItem?.lon,
          isCompleted: false,
        });

        nameIndex++;
      }
    }
  }

  events.push(returnEvent);

  // KRYTYCZNA WERYFIKACJA INWARIANTÓW:
  // 1. Dzień 1: żadna atrakcja NIE MOŻE być przed przyjazdem!
  // 2. Ostatni dzień: żadna atrakcja NIE MOŻE być po powrocie!
  for (let i = 0; i < events.length; i++) {
    const cur = events[i];
    if (cur.type === 'ATTRACTION') {
      const curM = timeStrToMinutes(cur.timeStr);
      if (cur.dateStr === dayDates[0]) {
        const arrM = timeStrToMinutes(arrTime);
        if (curM < arrM + 30) {
          const adjM = Math.min(22 * 60, arrM + 45);
          cur.timeStr = minutesToTimeStr(adjM);
          cur.parsedDate = parseTimelineDate(cur.dateStr, cur.timeStr);
        }
      }
      if (cur.dateStr === lastDateStr) {
        const retM = timeStrToMinutes(returnTime);
        if (curM > retM - 45) {
          const adjM = Math.max(9 * 60, retM - 60);
          cur.timeStr = minutesToTimeStr(adjM);
          cur.parsedDate = parseTimelineDate(cur.dateStr, cur.timeStr);
        }
      }
    }
  }

  // Sortowanie po parsedDate
  events.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  return events;
};

// Generowanie realistycznych godzin zwiedzania w zależności od liczby punktów w ciągu dnia
export const getTimeSlotsForDayAttractions = (
  count: number,
  isDayOne: boolean = false,
  isLastDay: boolean = false,
  earliestAllowedMinutes?: number,
  latestAllowedMinutes?: number
): string[] => {
  if (count <= 0) return [];

  if (earliestAllowedMinutes !== undefined || latestAllowedMinutes !== undefined) {
    const minM = earliestAllowedMinutes !== undefined ? earliestAllowedMinutes : (isDayOne ? 15 * 60 : 9 * 60 + 30);
    const maxM = latestAllowedMinutes !== undefined ? latestAllowedMinutes : (isLastDay ? 14 * 60 : 19 * 60 + 30);
    const safeMaxM = Math.max(minM + 45, maxM);

    if (count === 1) {
      const slotM = Math.round((minM + safeMaxM) / 2);
      return [minutesToTimeStr(slotM)];
    }
    if (count === 2) {
      const diff = safeMaxM - minM;
      const s1 = Math.round(minM + diff * 0.25);
      const s2 = Math.round(minM + diff * 0.75);
      return [minutesToTimeStr(s1), minutesToTimeStr(s2)];
    }
    const step = (safeMaxM - minM) / (count + 1);
    const slots: string[] = [];
    for (let s = 1; s <= count; s++) {
      slots.push(minutesToTimeStr(Math.round(minM + s * step)));
    }
    return slots;
  }

  // Standardowy fallback:
  if (count === 1) {
    return isDayOne ? ['16:30'] : isLastDay ? ['10:30'] : ['11:30'];
  }
  if (count === 2) {
    return isDayOne ? ['15:30', '18:00'] : isLastDay ? ['10:00', '12:30'] : ['10:30', '14:30'];
  }
  if (count === 3) {
    return isDayOne ? ['15:00', '17:15', '19:30'] : isLastDay ? ['09:30', '12:00', '14:30'] : ['10:00', '13:00', '16:00'];
  }
  if (count === 4) {
    return ['09:30', '12:00', '14:30', '17:00'];
  }
  const slots: string[] = [];
  let startHour = 9.5;
  for (let s = 0; s < count; s++) {
    const h = Math.floor(startHour);
    const m = (startHour % 1) * 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(Math.round(m)).padStart(2, '0')}`);
    startHour += 1.75;
  }
  return slots;
};

export interface OptimizeMultiDayTimelineParams {
  events: any[];
  targetDay?: string;
  poolAttractions?: Array<{ name?: string; lat?: number; lon?: number }>;
  destinationCity?: string;
  lodgingCoords?: { lat: number; lon: number } | null;
  tripStartDate?: string;
  tripEndDate?: string;
  streetDistances?: Record<string, number>;
  liveRouteInfos?: Record<string, StreetRouteInfo>;
  roadCostMatrix?: number[][] | null;
  costCriterion?: OptimizationCriterion;
  precomputedOrderedPoints?: GeoPoint[] | null;
  isApproximateMode?: boolean;
}

// Globalna, wielodniowa optymalizacja trasy (TSP) bez jakiegokolwiek mieszania dni
export const optimizeMultiDayTimeline = (
  params: OptimizeMultiDayTimelineParams
): any[] => {
  const {
    events,
    targetDay = 'ALL',
    poolAttractions = [],
    destinationCity = 'Rome',
    lodgingCoords = null,
    streetDistances = {},
    liveRouteInfos = {},
    roadCostMatrix = null,
    costCriterion = 'duration',
    precomputedOrderedPoints = null,
    isApproximateMode = false,
  } = params;

  if (!events || events.length === 0) return [];

  // 1. Ekstrakcja posortowanych chronologicznie unikalnych dni wyjazdu
  const uniqueDays = Array.from(
    new Set(
      events
        .map((e) => e.dateStr)
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    )
  ).sort((a, b) => {
    const tA = parseTimelineDate(a, '00:00').getTime();
    const tB = parseTimelineDate(b, '00:00').getTime();
    return tA - tB;
  });

  if (uniqueDays.length === 0) {
    return events;
  }

  // 2. Tryb pojedynczego dnia (targetDay !== 'ALL')
  if (targetDay && targetDay !== 'ALL') {
    const dayAttractions = events.filter(
      (e) => e.type === 'ATTRACTION' && e.dateStr === targetDay
    );

    if (dayAttractions.length < 2) {
      return events;
    }

    const geoPoints: GeoPoint[] = dayAttractions.map((e, idx) => {
      const coords = resolvePointCoordinates(
        e.title,
        poolAttractions,
        destinationCity,
        lodgingCoords,
        { lat: e.lat, lon: e.lon }
      );
      return {
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        lat: coords.lat,
        lon: coords.lon,
        originalIndex: idx,
      };
    });

    let orderedPoints: GeoPoint[];
    if (precomputedOrderedPoints && precomputedOrderedPoints.length === dayAttractions.length) {
      orderedPoints = precomputedOrderedPoints;
    } else {
      const lodgingEvt = events.find((e) => e.type === 'LODGING');
      let hotelPoint: GeoPoint | null = null;
      if (lodgingEvt) {
        const hc = resolvePointCoordinates(
          lodgingEvt.title,
          poolAttractions,
          destinationCity,
          lodgingCoords,
          { lat: lodgingEvt.lat, lon: lodgingEvt.lon }
        );
        if (typeof hc.lat === 'number' && Number.isFinite(hc.lat)) {
          hotelPoint = {
            id: lodgingEvt.id,
            title: lodgingEvt.title,
            lat: hc.lat,
            lon: hc.lon,
            type: 'LODGING',
            originalIndex: -1,
          };
        }
      } else if (lodgingCoords && typeof lodgingCoords.lat === 'number' && Number.isFinite(lodgingCoords.lat)) {
        hotelPoint = {
          id: 'lodging_hotel',
          title: 'Hotel',
          lat: lodgingCoords.lat,
          lon: lodgingCoords.lon,
          type: 'LODGING',
          originalIndex: -1,
        };
      }

      if (hotelPoint) {
        const dayRes = optimizeDayRouteWithHotel(hotelPoint, geoPoints, {
          matrix: roadCostMatrix && roadCostMatrix.length === geoPoints.length + 1 ? roadCostMatrix : undefined,
          criterion: costCriterion,
          isApproximate: isApproximateMode,
        });
        orderedPoints = dayRes.orderedAttractions;
      } else {
        const tsp = optimizeSightseeingRoute(
          geoPoints,
          false,
          roadCostMatrix || undefined,
          costCriterion,
          isApproximateMode
        );
        orderedPoints = tsp.orderedPoints;
      }
    }

    const isDayOne = uniqueDays.indexOf(targetDay) === 0;
    const hasDep = events.some((e) => e.type === 'DEPARTURE' && e.dateStr === targetDay);
    const startHour = isDayOne && hasDep ? 14 : 10;
    const startMinute = 0;

    const legTransits = orderedPoints.slice(0, -1).map((pt, idx) => {
      const nextPt = orderedPoints[idx + 1];
      const legKey = `${pt.id}_${nextPt.id}`;
      const routeInfo = liveRouteInfos[legKey];
      const customDist = streetDistances[legKey];
      const est = routeInfo || calculateTransitEstimates(pt, nextPt, customDist);
      return est.recommendedMode === 'walking' ? est.walkMinutes : est.transitMinutes;
    });

    const orderedCandidates = orderedPoints.map((gp) => {
      const original = dayAttractions.find((e) => e.id === gp.id);
      return {
        ...(original || {}),
        id: gp.id,
        type: 'ATTRACTION',
        title: gp.title,
        subtitle: gp.subtitle || original?.subtitle,
        dateStr: targetDay,
        lat: gp.lat,
        lon: gp.lon,
        parsedDate: parseTimelineDate(targetDay, `${startHour}:00`),
      };
    });

    const retimedDayAttractions = recalculateItineraryTimes(
      orderedCandidates,
      startHour,
      startMinute,
      legTransits
    ).map((item) => ({
      ...item,
      dateStr: targetDay,
      parsedDate: parseTimelineDate(targetDay, item.timeStr),
    }));

    let dayIdx = 0;
    const updatedEvents = events.map((e) => {
      if (e.type === 'ATTRACTION' && e.dateStr === targetDay) {
        const repl = retimedDayAttractions[dayIdx];
        dayIdx++;
        return repl || e;
      }
      return e;
    });

    return updatedEvents.sort((a, b) => {
      const tA = a.parsedDate instanceof Date ? a.parsedDate.getTime() : 0;
      const tB = b.parsedDate instanceof Date ? b.parsedDate.getTime() : 0;
      if (tA !== tB) return tA - tB;
      const priority = (type: string) => {
        if (type === 'DEPARTURE') return 1;
        if (type === 'ATTRACTION') return 2;
        if (type === 'LODGING') return 3;
        if (type === 'RETURN') return 4;
        return 2.5;
      };
      return priority(a.type) - priority(b.type);
    });
  }

  // 3. Tryb optymalizacji CAŁEGO WYJAZDU (targetDay === 'ALL')
  const allAttractions = events.filter((e) => e.type === 'ATTRACTION');
  if (allAttractions.length < 2) {
    return events;
  }

  const N = uniqueDays.length;
  const M = allAttractions.length;

  // Przypadek jedniodniowy
  if (N <= 1) {
    const singleDate = uniqueDays[0];
    const geoPoints: GeoPoint[] = allAttractions.map((e, idx) => {
      const coords = resolvePointCoordinates(
        e.title,
        poolAttractions,
        destinationCity,
        lodgingCoords,
        { lat: e.lat, lon: e.lon }
      );
      return {
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        lat: coords.lat,
        lon: coords.lon,
        originalIndex: idx,
      };
    });

    let orderedPoints: GeoPoint[];
    if (precomputedOrderedPoints && precomputedOrderedPoints.length === allAttractions.length) {
      orderedPoints = precomputedOrderedPoints;
    } else {
      const tsp = optimizeSightseeingRoute(
        geoPoints,
        false,
        roadCostMatrix || undefined,
        costCriterion,
        isApproximateMode
      );
      orderedPoints = tsp.orderedPoints;
    }

    const legTransits = orderedPoints.slice(0, -1).map((pt, idx) => {
      const nextPt = orderedPoints[idx + 1];
      const legKey = `${pt.id}_${nextPt.id}`;
      const routeInfo = liveRouteInfos[legKey];
      const customDist = streetDistances[legKey];
      const est = routeInfo || calculateTransitEstimates(pt, nextPt, customDist);
      return est.recommendedMode === 'walking' ? est.walkMinutes : est.transitMinutes;
    });

    const orderedCandidates = orderedPoints.map((gp) => {
      const original = allAttractions.find((e) => e.id === gp.id);
      return {
        ...(original || {}),
        id: gp.id,
        type: 'ATTRACTION',
        title: gp.title,
        subtitle: gp.subtitle || original?.subtitle,
        dateStr: singleDate,
        lat: gp.lat,
        lon: gp.lon,
        parsedDate: parseTimelineDate(singleDate, '10:00'),
      };
    });

    const timed = recalculateItineraryTimes(orderedCandidates, 10, 0, legTransits);
    let attrIdx = 0;
    const finalTimeline = events.map((event) => {
      if (event.type === 'ATTRACTION') {
        const replacement = timed[attrIdx];
        attrIdx++;
        return replacement || event;
      }
      return event;
    });

    return finalTimeline.sort((a, b) => {
      const tA = a.parsedDate instanceof Date ? a.parsedDate.getTime() : 0;
      const tB = b.parsedDate instanceof Date ? b.parsedDate.getTime() : 0;
      if (tA !== tB) return tA - tB;
      const priority = (type: string) => {
        if (type === 'DEPARTURE') return 1;
        if (type === 'ATTRACTION') return 2;
        if (type === 'LODGING') return 3;
        if (type === 'RETURN') return 4;
        return 2.5;
      };
      return priority(a.type) - priority(b.type);
    });
  }

  // Wyjazd wielodniowy (N >= 2):
  // 3a. TSP na wszystkich punktach programu
  const geoPoints: GeoPoint[] = allAttractions.map((e, idx) => {
    const coords = resolvePointCoordinates(
      e.title,
      poolAttractions,
      destinationCity,
      lodgingCoords,
      { lat: e.lat, lon: e.lon }
    );
    return {
      id: e.id,
      title: e.title,
      subtitle: e.subtitle,
      lat: coords.lat,
      lon: coords.lon,
      originalIndex: idx,
    };
  });

  let orderedPoints: GeoPoint[];
  if (precomputedOrderedPoints && precomputedOrderedPoints.length === allAttractions.length) {
    orderedPoints = precomputedOrderedPoints;
  } else {
    const tsp = optimizeSightseeingRoute(
      geoPoints,
      false,
      roadCostMatrix || undefined,
      costCriterion,
      isApproximateMode
    );
    orderedPoints = tsp.orderedPoints;
  }

  // 3b. Obliczanie zrównoważonych limitów (quotas) na poszczególne dni
  const existingCounts = uniqueDays.map(
    (d) => events.filter((e) => e.type === 'ATTRACTION' && e.dateStr === d).length
  );
  const isBalanced =
    existingCounts.every((c) => c <= 4) &&
    existingCounts.reduce((a, b) => a + b, 0) === M &&
    (N <= 2 || existingCounts.slice(1, N - 1).every((c) => c >= 1));

  let quotas: number[] = new Array(N).fill(0);
  if (isBalanced) {
    quotas = [...existingCounts];
  } else {
    if (N === 2) {
      const d1 = M >= 3 ? Math.min(2, Math.floor(M / 2)) : Math.min(1, M);
      quotas[0] = d1;
      quotas[1] = M - d1;
    } else {
      const d1 = M >= 5 ? 1 : (M >= 8 ? 2 : 0);
      quotas[0] = d1;
      const lastQ = (M - d1 >= 4) ? 1 : 0;
      quotas[N - 1] = lastQ;
      let remaining = M - d1 - lastQ;
      for (let d = 1; d < N - 1; d++) {
        const daysLeft = N - 1 - d;
        const take = Math.ceil(remaining / daysLeft);
        quotas[d] = Math.min(take, remaining);
        remaining -= quotas[d];
      }
      if (remaining > 0) {
        for (let d = 1; d < N && remaining > 0; d++) {
          quotas[d]++;
          remaining--;
        }
      }
    }
  }

  // 3c. Podział trasy TSP na poszczególne dni z czystym przypisaniem dat i godzin
  let pointCursor = 0;
  const attractionsByDay: Record<string, any[]> = {};

  for (let dayIdx = 0; dayIdx < N; dayIdx++) {
    const dayDateStr = uniqueDays[dayIdx];
    const count = quotas[dayIdx] || 0;
    const dayPoints = orderedPoints.slice(pointCursor, pointCursor + count);
    pointCursor += count;

    if (dayPoints.length === 0) {
      attractionsByDay[dayDateStr] = [];
      continue;
    }

    const isDayOne = dayIdx === 0;
    const dayDep = events.find((e) => e.type === 'DEPARTURE' && e.dateStr === dayDateStr);
    let startHour = 10;
    let startMin = 0;
    if (isDayOne && dayDep) {
      startHour = 14;
      startMin = 0;
    }

    const dayCandidates = dayPoints.map((gp) => {
      const original = allAttractions.find((e) => e.id === gp.id);
      return {
        ...(original || {}),
        id: gp.id,
        type: 'ATTRACTION',
        title: gp.title,
        subtitle: gp.subtitle || original?.subtitle,
        dateStr: dayDateStr,
        lat: gp.lat,
        lon: gp.lon,
        parsedDate: parseTimelineDate(dayDateStr, `${startHour}:00`),
      };
    });

    const dayLegTransits = dayPoints.slice(0, -1).map((pt, idx) => {
      const nextPt = dayPoints[idx + 1];
      const legKey = `${pt.id}_${nextPt.id}`;
      const routeInfo = liveRouteInfos[legKey];
      const customDist = streetDistances[legKey];
      const est = routeInfo || calculateTransitEstimates(pt, nextPt, customDist);
      return est.recommendedMode === 'walking' ? est.walkMinutes : est.transitMinutes;
    });

    const timed = recalculateItineraryTimes(dayCandidates, startHour, startMin, dayLegTransits);
    attractionsByDay[dayDateStr] = timed.map((c) => ({
      ...c,
      dateStr: dayDateStr,
      parsedDate: parseTimelineDate(dayDateStr, c.timeStr),
    }));
  }

  // 3d. Składanie finalnej osi czasu dzień po dniu (eliminacja jakiegokolwiek mieszania dat)
  const finalTimeline: any[] = [];
  const daySet = new Set(uniqueDays);

  for (let dayIdx = 0; dayIdx < N; dayIdx++) {
    const dayDateStr = uniqueDays[dayIdx];
    const dayNonAttractions = events.filter(
      (e) => e.type !== 'ATTRACTION' && e.dateStr === dayDateStr
    );

    const departureEvt = dayNonAttractions.find((e) => e.type === 'DEPARTURE');
    const lodgingEvt = dayNonAttractions.find((e) => e.type === 'LODGING');
    const returnEvt = dayNonAttractions.find((e) => e.type === 'RETURN');
    const otherEvts = dayNonAttractions.filter(
      (e) => !['DEPARTURE', 'LODGING', 'RETURN'].includes(e.type)
    );

    if (departureEvt) finalTimeline.push(departureEvt);
    const dayAttrs = attractionsByDay[dayDateStr] || [];
    finalTimeline.push(...dayAttrs);
    finalTimeline.push(...otherEvts);
    if (lodgingEvt) finalTimeline.push(lodgingEvt);
    if (returnEvt) finalTimeline.push(returnEvt);
  }

  // Bezpieczeństwo: dołączamy ewentualne punkty bez określonego dnia
  const orphanEvents = events.filter(
    (e) => e.type !== 'ATTRACTION' && (!e.dateStr || !daySet.has(e.dateStr))
  );
  finalTimeline.push(...orphanEvents);

  // Końcowe posortowanie chronologiczne
  return finalTimeline.sort((a, b) => {
    const tA = a.parsedDate instanceof Date ? a.parsedDate.getTime() : 0;
    const tB = b.parsedDate instanceof Date ? b.parsedDate.getTime() : 0;
    if (tA !== tB) return tA - tB;
    const priority = (type: string) => {
      if (type === 'DEPARTURE') return 1;
      if (type === 'ATTRACTION') return 2;
      if (type === 'LODGING') return 3;
      if (type === 'RETURN') return 4;
      return 2.5;
    };
    return priority(a.type) - priority(b.type);
  });
};


