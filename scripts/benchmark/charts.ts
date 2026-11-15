/**
 * Proste wykresy SVG do pracy (druk / Word / LaTeX). Bez zależności zewnętrznych.
 * Paleta kategoryczna sprawdzona walidatorem (CVD i kontrast); słaby kontrast dwóch kolorów
 * kompensują etykiety na końcach linii, legenda, różne kształty znaczników i tabela CSV.
 */

export const SERIES_STYLE: Record<string, { color: string; marker: 'circle' | 'square' | 'triangle' | 'diamond'; label: string }> = {
  greedy: { color: '#2a78d6', marker: 'circle', label: 'Zachłanny (NN)' },
  '2opt': { color: '#eb6834', marker: 'square', label: '2-opt' },
  simulated_annealing: { color: '#1baf7a', marker: 'triangle', label: 'Symulowane wyżarzanie' },
  brute_force: { color: '#eda100', marker: 'diamond', label: 'Metoda dokładna' },
};

const INK = '#1f1f1e';
const INK_MUTED = '#6b6b68';
const GRID = '#e4e3df';
const SURFACE = '#fcfcfb';
const FONT = 'font-family="Inter, Arial, sans-serif"';

const W = 720;
const H = 440;
const M = { top: 56, right: 170, bottom: 56, left: 72 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function marker(shape: string, x: number, y: number, color: string): string {
  const r = 4.5;
  const ring = `stroke="${SURFACE}" stroke-width="2"`;
  switch (shape) {
    case 'square':
      return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1" fill="${color}" ${ring}/>`;
    case 'triangle':
      return `<path d="M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z" fill="${color}" ${ring}/>`;
    case 'diamond':
      return `<path d="M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z" fill="${color}" ${ring}/>`;
    default:
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${ring}/>`;
  }
}

function frame(title: string, subtitle: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="${SURFACE}"/>
<text x="${M.left}" y="24" font-size="16" font-weight="700" fill="${INK}">${esc(title)}</text>
<text x="${M.left}" y="42" font-size="12" fill="${INK_MUTED}">${esc(subtitle)}</text>
${body}
</svg>
`;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export interface LineSeries {
  id: string;
  points: Array<{ x: number; y: number }>;
}

/** Wykres liniowy: oś X = n, oś Y liniowa albo logarytmiczna. */
export function lineChart(opts: {
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  series: LineSeries[];
  logY?: boolean;
  yFormat?: (v: number) => string;
}): string {
  const all = opts.series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const fmt = opts.yFormat || ((v: number) => String(v));

  let yScale: (v: number) => number;
  let yTicks: number[];
  if (opts.logY) {
    const positive = all.map((p) => p.y).filter((v) => v > 0);
    const lo = Math.floor(Math.log10(Math.min(...positive)));
    const hi = Math.ceil(Math.log10(Math.max(...positive)));
    yTicks = [];
    for (let e = lo; e <= hi; e++) yTicks.push(Math.pow(10, e));
    yScale = (v) => M.top + PH - ((Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo || 1)) * PH;
  } else {
    const yMax = Math.max(...all.map((p) => p.y), 0.0001);
    yTicks = niceTicks(0, yMax * 1.1);
    const top = yTicks[yTicks.length - 1];
    yScale = (v) => M.top + PH - (v / top) * PH;
  }
  const xScale = (v: number) => M.left + ((v - xMin) / (xMax - xMin || 1)) * PW;

  const grid = yTicks
    .map((t) => {
      const y = yScale(t);
      return `<line x1="${M.left}" x2="${M.left + PW}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="1"/>
<text x="${M.left - 8}" y="${y + 4}" font-size="11" text-anchor="end" fill="${INK_MUTED}">${esc(fmt(t))}</text>`;
    })
    .join('\n');
  const xTickValues = Array.from(new Set(xs)).sort((a, b) => a - b);
  const xAxis = xTickValues
    .map((t) => `<text x="${xScale(t)}" y="${M.top + PH + 18}" font-size="11" text-anchor="middle" fill="${INK_MUTED}">${t}</text>`)
    .join('\n');

  const lines = opts.series
    .map((s) => {
      const st = SERIES_STYLE[s.id];
      const pts = [...s.points].sort((a, b) => a.x - b.x);
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(' ');
      const markers = pts.map((p) => marker(st.marker, xScale(p.x), yScale(p.y), st.color)).join('');
      return `<path d="${d}" fill="none" stroke="${st.color}" stroke-width="2" stroke-linejoin="round"/>${markers}`;
    })
    .join('\n');

  // Etykiety bezpośrednie na końcu linii (z rozsunięciem, żeby się nie nakładały)
  const ends = opts.series
    .map((s) => {
      const last = [...s.points].sort((a, b) => a.x - b.x).pop()!;
      return { id: s.id, x: xScale(last.x), y: yScale(last.y) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const labels = ends
    .map((e) => {
      const st = SERIES_STYLE[e.id];
      return `${marker(st.marker, e.x + 14, e.y, st.color)}<text x="${e.x + 24}" y="${e.y + 4}" font-size="12" fill="${INK}">${esc(st.label)}</text>`;
    })
    .join('\n');

  const axes = `<line x1="${M.left}" x2="${M.left + PW}" y1="${M.top + PH}" y2="${M.top + PH}" stroke="${INK_MUTED}" stroke-width="1"/>
<text x="${M.left + PW / 2}" y="${H - 14}" font-size="12" text-anchor="middle" fill="${INK}">${esc(opts.xLabel)}</text>
<text transform="translate(18 ${M.top + PH / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${INK}">${esc(opts.yLabel)}</text>`;

  return frame(opts.title, opts.subtitle, `${grid}\n${xAxis}\n${axes}\n${lines}\n${labels}`);
}

/** Wykres pudełkowy (mediana, kwartyle, wąsy 1.5 IQR) dla kilku algorytmów przy jednym n. */
export function boxPlot(opts: {
  title: string;
  subtitle: string;
  yLabel: string;
  groups: Array<{ id: string; values: number[] }>;
  yFormat?: (v: number) => string;
}): string {
  const fmt = opts.yFormat || ((v: number) => String(v));
  const q = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const yMax = Math.max(...opts.groups.flatMap((g) => g.values), 0.0001);
  const ticks = niceTicks(0, yMax * 1.1);
  const top = ticks[ticks.length - 1];
  const yScale = (v: number) => M.top + PH - (v / top) * PH;
  const band = PW / opts.groups.length;

  const grid = ticks
    .map((t) => `<line x1="${M.left}" x2="${M.left + PW}" y1="${yScale(t)}" y2="${yScale(t)}" stroke="${GRID}"/>
<text x="${M.left - 8}" y="${yScale(t) + 4}" font-size="11" text-anchor="end" fill="${INK_MUTED}">${esc(fmt(t))}</text>`)
    .join('\n');

  const boxes = opts.groups
    .map((g, i) => {
      const st = SERIES_STYLE[g.id];
      const cx = M.left + band * i + band / 2;
      const q1 = q(g.values, 0.25);
      const med = q(g.values, 0.5);
      const q3 = q(g.values, 0.75);
      const iqr = q3 - q1;
      const lo = Math.min(...g.values.filter((v) => v >= q1 - 1.5 * iqr));
      const hi = Math.max(...g.values.filter((v) => v <= q3 + 1.5 * iqr));
      const outliers = g.values.filter((v) => v < lo || v > hi);
      const bw = Math.min(56, band * 0.45);
      return `<line x1="${cx}" x2="${cx}" y1="${yScale(hi)}" y2="${yScale(lo)}" stroke="${INK_MUTED}" stroke-width="1.5"/>
<rect x="${cx - bw / 2}" y="${yScale(q3)}" width="${bw}" height="${Math.max(2, yScale(q1) - yScale(q3))}" rx="4" fill="${st.color}" fill-opacity="0.85" stroke="${SURFACE}" stroke-width="2"/>
<line x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${yScale(med)}" y2="${yScale(med)}" stroke="${INK}" stroke-width="2"/>
${outliers.map((v) => `<circle cx="${cx}" cy="${yScale(v)}" r="3" fill="none" stroke="${INK_MUTED}"/>`).join('')}
<text x="${cx}" y="${M.top + PH + 18}" font-size="11" text-anchor="middle" fill="${INK}">${esc(st.label)}</text>
<text x="${cx + bw / 2 + 6}" y="${yScale(med) + 4}" font-size="11" fill="${INK}">${esc(fmt(med))}</text>`;
    })
    .join('\n');

  const axes = `<line x1="${M.left}" x2="${M.left + PW}" y1="${M.top + PH}" y2="${M.top + PH}" stroke="${INK_MUTED}"/>
<text transform="translate(18 ${M.top + PH / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${INK}">${esc(opts.yLabel)}</text>`;
  return frame(opts.title, opts.subtitle, `${grid}\n${axes}\n${boxes}`);
}
