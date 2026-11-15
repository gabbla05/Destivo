/// <reference types="jest" />
/**
 * Benchmark algorytmów kolejności zwiedzania (TSP, ścieżka otwarta ze stałym punktem startu).
 * Uruchomienie: npm run benchmark  ->  wyniki i wykresy w docs/benchmark/
 *
 * Wywołuje te same funkcje co aplikacja (src/lib/routeOptimization.ts). Aplikacja nie pokazuje
 * tych porównań użytkownikowi - to wyłącznie materiał do pracy (decyzja D4).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import {
  buildDistanceMatrix,
  calculatePathDistance,
  solveGreedyTSP,
  solveTwoOptTSP,
  solveSimulatedAnnealingTSP,
  solveBruteForceTSP,
} from '../../src/lib/routeOptimization';
import { lineChart, boxPlot, SERIES_STYLE } from './charts';

const SIZES = [5, 6, 7, 8, 10, 12, 15, 20, 25, 30];
const REPETITIONS = 20;
const BASE_SEED = 20261115;
const EXACT_MAX_N = 8;
const BOX_N = 12;
// Kraków: prostokąt obejmujący Stare Miasto, Kazimierz, Podgórze i Nową Hutę (zachodnia część)
const AREA = { latMin: 50.02, latMax: 50.1, lonMin: 19.88, lonMax: 20.05 };
const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'benchmark');

type AlgoId = 'greedy' | '2opt' | 'simulated_annealing' | 'brute_force';

interface Row {
  n: number;
  run: number;
  seed: number;
  algorithm: AlgoId;
  cost_km: number;
  time_ms: number;
  iterations: number;
  gap_percent: number;
  improvement_vs_input_percent: number;
  reference: 'exact' | 'best_found';
}

/** Deterministyczny generator liczb losowych (mulberry32) - wyniki powtarzalne. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPoints(n: number, seed: number) {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Punkt ${i}`,
    lat: AREA.latMin + rnd() * (AREA.latMax - AREA.latMin),
    lon: AREA.lonMin + rnd() * (AREA.lonMax - AREA.lonMin),
  }));
}

function timed<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const round = (v: number, d = 4) => Number(v.toFixed(d));

test('benchmark TSP: generuje CSV, JSON i wykresy w docs/benchmark', () => {
  const rows: Row[] = [];

  for (const n of SIZES) {
    for (let run = 0; run < REPETITIONS; run++) {
      const seed = BASE_SEED + n * 1000 + run;
      const points = randomPoints(n, seed);
      const matrix = buildDistanceMatrix(points as any);
      // Trasa wejściowa = kolejność dodania atrakcji przez użytkownika
      const inputCost = calculatePathDistance(points.map((_, i) => i), matrix);

      const greedy = timed(() => solveGreedyTSP(matrix, 0));
      const twoOpt = timed(() => solveTwoOptTSP(greedy.result.route, matrix, true));
      const sa = timed(() => solveSimulatedAnnealingTSP(greedy.result.route, matrix, true, seed));
      const exact = n <= EXACT_MAX_N ? timed(() => solveBruteForceTSP(matrix, true)) : null;

      // Czas 2-opt i SA liczony łącznie z trasą startową z algorytmu zachłannego (tak działa aplikacja)
      const results: Array<{ id: AlgoId; cost: number; ms: number; iterations: number }> = [
        { id: 'greedy', cost: greedy.result.distance, ms: greedy.ms, iterations: greedy.result.iterations },
        { id: '2opt', cost: twoOpt.result.distance, ms: greedy.ms + twoOpt.ms, iterations: twoOpt.result.iterations },
        { id: 'simulated_annealing', cost: sa.result.distance, ms: greedy.ms + sa.ms, iterations: sa.result.iterations },
      ];
      if (exact?.result) {
        results.push({ id: 'brute_force', cost: exact.result.distance, ms: exact.ms, iterations: exact.result.iterations });
      }

      const reference = exact?.result ? exact.result.distance : Math.min(...results.map((r) => r.cost));
      for (const r of results) {
        rows.push({
          n,
          run,
          seed,
          algorithm: r.id,
          cost_km: round(r.cost),
          time_ms: round(r.ms, 4),
          iterations: r.iterations,
          gap_percent: round(reference > 0 ? ((r.cost - reference) / reference) * 100 : 0, 3),
          improvement_vs_input_percent: round(inputCost > 0 ? ((inputCost - r.cost) / inputCost) * 100 : 0, 3),
          reference: exact?.result ? 'exact' : 'best_found',
        });
      }
    }
  }

  // Sanity: metoda dokładna jest zawsze najlepsza, a heurystyki nie mogą być od niej lepsze
  rows.filter((r) => r.reference === 'exact').forEach((r) => expect(r.gap_percent).toBeGreaterThanOrEqual(-1e-6));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const header = Object.keys(rows[0]) as Array<keyof Row>;
  fs.writeFileSync(
    path.join(OUT_DIR, 'results.csv'),
    [header.join(','), ...rows.map((r) => header.map((h) => r[h]).join(','))].join('\n') + '\n'
  );

  const algos: AlgoId[] = ['greedy', '2opt', 'simulated_annealing', 'brute_force'];
  const summary = SIZES.flatMap((n) =>
    algos
      .map((a) => ({ a, list: rows.filter((r) => r.n === n && r.algorithm === a) }))
      .filter(({ list }) => list.length > 0)
      .map(({ a, list }) => ({
        n,
        algorithm: a,
        runs: list.length,
        median_time_ms: round(median(list.map((r) => r.time_ms)), 4),
        mean_gap_percent: round(mean(list.map((r) => r.gap_percent)), 3),
        max_gap_percent: round(Math.max(...list.map((r) => r.gap_percent)), 3),
        optimal_share_percent: round((list.filter((r) => r.gap_percent < 1e-6).length / list.length) * 100, 1),
        mean_improvement_vs_input_percent: round(mean(list.map((r) => r.improvement_vs_input_percent)), 2),
      }))
  );
  fs.writeFileSync(path.join(OUT_DIR, 'summary.csv'), [
    Object.keys(summary[0]).join(','),
    ...summary.map((s) => Object.values(s).join(',')),
  ].join('\n') + '\n');

  const meta = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0]?.model || 'unknown',
    sizes: SIZES,
    repetitions: REPETITIONS,
    baseSeed: BASE_SEED,
    area: AREA,
    matrix: 'haversine (odległość w linii prostej, km)',
  };
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ meta, summary, rows }, null, 2));

  // Wykres 1: czas obliczeń (mediana) w funkcji n - skala logarytmiczna
  const seriesFor = (metric: 'median_time_ms' | 'mean_gap_percent', ids: AlgoId[]) =>
    ids.map((id) => ({
      id,
      points: summary.filter((s) => s.algorithm === id).map((s) => ({ x: s.n, y: Math.max(s[metric], metric === 'median_time_ms' ? 0.001 : 0) })),
    }));
  fs.writeFileSync(
    path.join(OUT_DIR, 'time_vs_n.svg'),
    lineChart({
      title: 'Czas obliczeń w zależności od liczby punktów',
      subtitle: `Mediana z ${REPETITIONS} losowych zestawów punktów w Krakowie; skala logarytmiczna`,
      xLabel: 'Liczba punktów trasy (n)',
      yLabel: 'Czas [ms]',
      series: seriesFor('median_time_ms', algos),
      logY: true,
      yFormat: (v) => (v >= 1 ? String(v) : v.toString()),
    })
  );

  // Wykres 2: średnie odchylenie od optimum w funkcji n
  fs.writeFileSync(
    path.join(OUT_DIR, 'gap_vs_n.svg'),
    lineChart({
      title: 'Jakość rozwiązań: odchylenie od optimum',
      subtitle: `n ≤ ${EXACT_MAX_N}: względem metody dokładnej; n > ${EXACT_MAX_N}: względem najlepszego znalezionego wyniku`,
      xLabel: 'Liczba punktów trasy (n)',
      yLabel: 'Średnie odchylenie [%]',
      series: seriesFor('mean_gap_percent', ['greedy', '2opt', 'simulated_annealing']),
      yFormat: (v) => `${v}%`,
    })
  );

  // Wykres 3: rozkład jakości dla wybranego n
  fs.writeFileSync(
    path.join(OUT_DIR, `boxplot_gap_n${BOX_N}.svg`),
    boxPlot({
      title: `Rozkład odchylenia od najlepszego wyniku (n = ${BOX_N})`,
      subtitle: `${REPETITIONS} losowych zestawów punktów; pudełko = kwartyle, kreska = mediana`,
      yLabel: 'Odchylenie [%]',
      groups: (['greedy', '2opt', 'simulated_annealing'] as AlgoId[]).map((id) => ({
        id,
        values: rows.filter((r) => r.n === BOX_N && r.algorithm === id).map((r) => r.gap_percent),
      })),
      yFormat: (v) => `${Number(v.toFixed(2))}%`,
    })
  );

  // Podsumowanie w konsoli
  // eslint-disable-next-line no-console
  console.log(
    summary
      .map((s) => `n=${s.n} ${SERIES_STYLE[s.algorithm].label}: ${s.median_time_ms} ms, odchylenie ${s.mean_gap_percent}%`)
      .join('\n')
  );
});
