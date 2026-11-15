import { Buffer } from 'buffer';
import { qrToPngDataUrl } from './qrImage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { VaultManager, VaultFileReference } from './vaultManager';
import { detectAndCropQrFromImage, detectAndCropQrFromPdf } from './offlineTravelBriefing';

/**
 * Odczyt kodu QR z biletu (P11) do widoku "Bilet w zasięgu ręki".
 *
 * Pokazujemy wyłącznie kod faktycznie ODCZYTANY z biletu (jsQR), wygenerowany na nowo duży i ostry.
 * Wycinki "podobne do kodu" oraz linki z tekstu PDF są pomijane - wtedy użytkownik widzi oryginalny plik.
 */

export interface TicketQrResult {
  /** Obraz PNG (data URL) z kodem wygenerowanym z odczytanej treści, albo null. */
  qrDataUrl: string | null;
}

/** Zdjęcie skalujemy przed analizą - dekodowanie 12 MP w JavaScript trwałoby zbyt długo. */
const SCAN_WIDTH = 1200;

const cache = new Map<string, TicketQrResult>();

interface TicketFileLike {
  id?: string;
  name?: string;
  uri?: string;
  type?: string;
  createdAt?: string;
  encryptionVersion?: number;
}

export const isPdfTicket = (file: TicketFileLike) => {
  const name = (file.name || '').toLowerCase();
  return file.type === 'PDF' || name.endsWith('.pdf');
};

async function scanImage(readableUri: string) {
  const resized = await manipulateAsync(readableUri, [{ resize: { width: SCAN_WIDTH } }], {
    base64: true,
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  // Pomniejszona kopia to też odszyfrowany bilet - usuwamy ją od razu
  if (resized.uri) VaultManager.deleteFile(resized.uri).catch(() => undefined);
  if (!resized.base64) return null;
  return detectAndCropQrFromImage(Buffer.from(resized.base64, 'base64'), false);
}

async function scanPdf(file: TicketFileLike) {
  const base64 = await VaultManager.readFileAsBase64({
    id: file.id || file.uri || '',
    name: file.name || 'bilet.pdf',
    uri: file.uri || '',
    type: 'PDF',
    createdAt: file.createdAt || '',
    encryptionVersion: file.encryptionVersion,
  } as VaultFileReference);
  return detectAndCropQrFromPdf(Buffer.from(base64, 'base64'));
}

/**
 * @param file       bilet (zaszyfrowany plik Sejfu lub starszy niezaszyfrowany)
 * @param readableUri odszyfrowana kopia tymczasowa (dla zdjęć)
 */
export async function detectTicketQr(file: TicketFileLike, readableUri?: string | null): Promise<TicketQrResult> {
  const key = file.uri || '';
  if (!key) return { qrDataUrl: null };
  const cached = cache.get(key);
  if (cached) return cached;

  let result: TicketQrResult = { qrDataUrl: null };
  try {
    const detection = isPdfTicket(file)
      ? await scanPdf(file)
      : readableUri
        ? await scanImage(readableUri)
        : null;
    if (detection?.source === 'decoded' && detection.qrData) {
      const qrDataUrl = qrToPngDataUrl(detection.qrData, { width: 600, margin: 2 });
      result = { qrDataUrl };
    }
  } catch (e) {
    console.warn('Destivo: nie udało się przeanalizować biletu w poszukiwaniu kodu QR:', e);
  }
  cache.set(key, result);
  return result;
}

/**
 * Kody QR z biletów "tam" i "powrót" podróży do PDF Offline Briefing.
 * Zdjęcia są na chwilę odszyfrowywane do pliku tymczasowego, który od razu usuwamy.
 */
export async function collectTripTicketQrCodes(
  transportData: any
): Promise<Array<{ leg: 'outbound' | 'return'; name: string; qrDataUrl: string }>> {
  let data = transportData;
  try {
    data = typeof transportData === 'string' ? JSON.parse(transportData || '{}') : transportData || {};
  } catch {
    return [];
  }
  const details = data.details || {};
  const legs: Array<{ leg: 'outbound' | 'return'; file: any }> = [
    { leg: 'outbound', file: details.outboundTicketFile || details.ticketFile || data.outboundTicketFile || data.ticketFile },
    { leg: 'return', file: details.returnTicketFile || data.returnTicketFile },
  ];

  const out: Array<{ leg: 'outbound' | 'return'; name: string; qrDataUrl: string }> = [];
  for (const { leg, file } of legs) {
    if (!file?.uri) continue;
    let temporaryUri: string | null = null;
    try {
      let readableUri: string | null = null;
      if (!isPdfTicket(file)) {
        const copy = await VaultManager.createDecryptedTemporaryCopy(file as VaultFileReference);
        readableUri = copy.uri;
        if (copy.isTemporary) temporaryUri = copy.uri;
      }
      const res = await detectTicketQr(file, readableUri);
      if (res.qrDataUrl) out.push({ leg, name: file.name || '', qrDataUrl: res.qrDataUrl });
    } catch (e) {
      console.warn('Destivo: pominięto bilet przy tworzeniu PDF:', e);
    } finally {
      if (temporaryUri) await VaultManager.deleteFile(temporaryUri).catch(() => undefined);
    }
  }
  return out;
}

/** Tylko do testów. */
export function __resetTicketQrCacheForTests() {
  cache.clear();
}
