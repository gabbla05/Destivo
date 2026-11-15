/// <reference types="jest" />
/**
 * Realistyczny przypadek z telefonu: strona e-biletu A4 wyrenderowana do JPEG w szerokości 1600 px
 * (react-native-pdf-thumbnail), z małym kodem QR (~3,5 cm) wśród tekstu i ramek.
 */
import { Buffer } from 'buffer';
import QRCode from 'qrcode';
import * as jpeg from 'jpeg-js';
import { detectAndCropQrFromImage } from '../src/lib/offlineTravelBriefing';

const PAGE_W = 1600;
const PAGE_H = Math.round(PAGE_W * (297 / 210));

function renderTicketPage(payload: string, qrSidePx: number, qrX: number, qrY: number): Buffer {
  const rgba = new Uint8Array(PAGE_W * PAGE_H * 4).fill(255);
  const setPx = (x: number, y: number, v: number) => {
    const i = (y * PAGE_W + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  };
  // "tekst" biletu: poziome paski w różnych miejscach strony
  for (let row = 0; row < 40; row++) {
    const y0 = 120 + row * 52;
    for (let y = y0; y < y0 + 14; y++) for (let x = 120; x < 120 + ((row * 97) % 900) + 300; x++) if ((x >> 3) % 3) setPx(x, y, 40);
  }
  // kod QR
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const scale = qrSidePx / (size + 8);
  for (let y = 0; y < qrSidePx; y++) {
    for (let x = 0; x < qrSidePx; x++) {
      const mx = Math.floor(x / scale) - 4;
      const my = Math.floor(y / scale) - 4;
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && qr.modules.data[my * size + mx];
      setPx(qrX + x, qrY + y, dark ? 0 : 255);
    }
  }
  return Buffer.from(jpeg.encode({ data: rgba, width: PAGE_W, height: PAGE_H }, 85).data);
}

describe('kod QR ze strony PDF wyrenderowanej do obrazu', () => {
  test.each([
    ['mały kod 3,5 cm w prawym górnym rogu', 270, 1250, 140],
    ['średni kod 5 cm na środku strony', 380, 610, 1100],
  ])('%s', (_label, side, x, y) => {
    const payload = 'IC|20261120|WAW-KRK|WAGON:7|MIEJSCE:45|NR:IC-77812345';
    const page = renderTicketPage(payload, side as number, x as number, y as number);
    const res = detectAndCropQrFromImage(page, false);
    expect(res.source).toBe('decoded');
    expect(res.qrData).toBe(payload);
  });
});
