import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import jsQR from 'jsqr';
import * as UPNG from 'upng-js';
import { qrToPngDataUrl } from '../src/lib/qrImage';

const decode = (dataUrl: string) => {
  const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  const img = (UPNG as any).decode(buf);
  const rgba = new Uint8ClampedArray((UPNG as any).toRGBA8(img)[0]);
  return { qr: jsQR(rgba, img.width, img.height), width: img.width };
};

describe('qrToPngDataUrl - kod QR bez canvas (działa w React Native)', () => {
  it('zwraca PNG, który da się z powrotem odczytać', () => {
    const payload = 'PKP-IC|2026-11-20|WAW-KRK|WAGON 7 MIEJSCE 45';
    const dataUrl = qrToPngDataUrl(payload, { width: 600 });
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const { qr, width } = decode(dataUrl);
    expect(qr?.data).toBe(payload);
    expect(width).toBeGreaterThan(400);
    expect(width).toBeLessThanOrEqual(600);
  });

  it('kod z biletu z danymi binarnymi jest odtwarzany bajt w bajt (wierna kopia oryginału)', () => {
    // dane jak w biletach z podpisem cyfrowym: bajty spoza ASCII i zera
    const original = Uint8Array.from([0x23, 0x55, 0x54, 0x01, 0x00, 0xff, 0xfe, 0x80, 0x9c, 0x41, 0x42, 0x00, 0x10, 0xc3, 0x28]);
    const { qr } = decode(qrToPngDataUrl(Array.from(original), { width: 600 }));
    expect(qr).not.toBeNull();
    expect(Array.from(qr!.binaryData)).toEqual(Array.from(original));
  });

  it('ścieżka biletu: odczyt jsQR -> bajty -> nowy kod daje identyczną treść', () => {
    const ticketPayload = 'IC|20261120|WAW-KRK|Wagon 7, miejsce 45|Zażółć';
    const first = decode(qrToPngDataUrl(ticketPayload, { width: 500 })).qr!;
    const regenerated = decode(qrToPngDataUrl(Array.from(first.binaryData), { width: 600 })).qr!;
    expect(Array.from(regenerated.binaryData)).toEqual(Array.from(first.binaryData));
    expect(regenerated.data).toBe(ticketPayload);
  });

  it('obsługuje własny kolor modułów', () => {
    const { qr } = decode(qrToPngDataUrl('https://destivo.app', { width: 240, margin: 1, dark: '#0F172A' }));
    expect(qr?.data).toBe('https://destivo.app');
  });

  it('kod aplikacji nie używa QRCode.toDataURL/toBuffer (na telefonie wymagają canvas i zawsze zawodzą)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/QRCode\.(toDataURL|toBuffer|toCanvas|toFile)\(/.test(src)) offenders.push(full);
        }
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    expect(offenders).toEqual([]);
  });
});
