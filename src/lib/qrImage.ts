import { Buffer } from 'buffer';
import QRCode from 'qrcode';
import * as UPNG from 'upng-js';

/**
 * Generuje kod QR jako obraz PNG (data URL) bez użycia <canvas>.
 *
 * `QRCode.toDataURL` w React Native korzysta z przeglądarkowej wersji biblioteki, która wymaga
 * elementu canvas i na telefonie zawsze rzuca wyjątek (w Jest działa, bo używa wersji Node).
 * Tutaj bierzemy samą macierz modułów z `QRCode.create` i kodujemy PNG przez UPNG - działa
 * identycznie w aplikacji, w Jest i w PDF (expo-print).
 */
export interface QrPngOptions {
  /** Docelowa szerokość obrazu w pikselach (przybliżona - zaokrąglana do pełnych modułów). */
  width?: number;
  /** Margines (strefa ciszy) w modułach. */
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  dark?: string;
  light?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const v = parseInt(full, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * @param content tekst albo surowe bajty odczytane z biletu (bajty są kodowane 1:1 w trybie "byte")
 */
export function qrToPngDataUrl(content: string | number[] | Uint8Array, options: QrPngOptions = {}): string {
  const { width = 600, margin = 2, errorCorrectionLevel = 'M', dark = '#000000', light = '#FFFFFF' } = options;
  const qr =
    typeof content === 'string'
      ? QRCode.create(content, { errorCorrectionLevel })
      : QRCode.create([{ data: Uint8Array.from(content), mode: 'byte' }] as any, { errorCorrectionLevel });
  const size: number = qr.modules.size;
  const modules: ArrayLike<number | boolean> = qr.modules.data;
  const total = size + margin * 2;
  const scale = Math.max(1, Math.floor(width / total));
  const px = total * scale;

  const [dr, dg, db] = hexToRgb(dark);
  const [lr, lg, lb] = hexToRgb(light);
  const rgba = new Uint8Array(px * px * 4);
  for (let y = 0; y < px; y++) {
    const my = Math.floor(y / scale) - margin;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - margin;
      const isDark = mx >= 0 && my >= 0 && mx < size && my < size && Boolean(modules[my * size + mx]);
      const i = (y * px + x) * 4;
      rgba[i] = isDark ? dr : lr;
      rgba[i + 1] = isDark ? dg : lg;
      rgba[i + 2] = isDark ? db : lb;
      rgba[i + 3] = 255;
    }
  }
  const png = (UPNG as any).encode([rgba.buffer], px, px, 0);
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}
