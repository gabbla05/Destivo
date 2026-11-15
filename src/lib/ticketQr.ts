import { Buffer } from 'buffer';
import { qrToPngDataUrl } from './qrImage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import PdfThumbnail from 'react-native-pdf-thumbnail';
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
/** Strona PDF renderowana do obrazu: A4 w tej szerokości daje ~5 px na moduł typowego kodu z biletu. */
const PDF_RENDER_WIDTH = 1600;
/** Kod jest zwykle na pierwszej stronie; drugą sprawdzamy dla biletów wielostronicowych. */
const PDF_MAX_PAGES = 2;

const cache = new Map<string, TicketQrResult>();

interface TicketFileLike {
  id?: string;
  name?: string;
  uri?: string;
  type?: string;
  createdAt?: string;
  encryptionVersion?: number;
}

const looksLikePdfPath = (value?: string | null) => /\.pdf(\?|#|$)/i.test((value || '').trim());

export const isPdfTicket = (file: TicketFileLike, readableUri?: string | null) => {
  const type = (file.type || '').toLowerCase();
  return (
    type === 'pdf' ||
    type.includes('application/pdf') ||
    looksLikePdfPath(file.name) ||
    looksLikePdfPath(file.uri) ||
    looksLikePdfPath(readableUri)
  );
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

/** Odczyt kodu z wyrenderowanych stron PDF (kody rysowane wektorowo lub zapisane jako bitmapa Flate). */
async function scanPdfPages(readablePdfUri: string) {
  for (let page = 0; page < PDF_MAX_PAGES; page++) {
    let rendered: { uri: string } | null = null;
    try {
      rendered = await PdfThumbnail.generate(readablePdfUri, page, { maxWidth: PDF_RENDER_WIDTH, quality: 92 });
    } catch {
      // Strona poza zakresem (PDF jednostronicowy) albo nieczytelny plik
      return null;
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(rendered.uri, { encoding: 'base64' });
      const detection = detectAndCropQrFromImage(Buffer.from(base64, 'base64'), false);
      if (detection?.source === 'decoded' && detection.qrData) return detection;
    } finally {
      // Obraz strony to odszyfrowana treść biletu - usuwamy od razu
      VaultManager.deleteFile(rendered.uri).catch(() => undefined);
    }
  }
  return null;
}

async function scanPdf(file: TicketFileLike, readableUri?: string | null) {
  // 1. Szybka ścieżka: kod zapisany w PDF jako osadzony obraz JPEG
  try {
    const embedded = await scanPdfEmbedded(file);
    if (embedded?.source === 'decoded' && embedded.qrData) return embedded;
  } catch {
    // przechodzimy do renderowania stron
  }
  // 2. Renderowanie stron do obrazu (większość e-biletów rysuje kod wektorowo)
  let temporaryUri: string | null = null;
  try {
    let pdfUri = readableUri && looksLikePdfPath(readableUri) ? readableUri : null;
    if (!pdfUri) {
      const copy = await VaultManager.createDecryptedTemporaryCopy(file as VaultFileReference);
      pdfUri = copy.uri;
      if (copy.isTemporary) temporaryUri = copy.uri;
    }
    return await scanPdfPages(pdfUri);
  } finally {
    if (temporaryUri) VaultManager.deleteFile(temporaryUri).catch(() => undefined);
  }
}

async function scanPdfEmbedded(file: TicketFileLike) {
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
    const detection = isPdfTicket(file, readableUri)
      ? await scanPdf(file, readableUri)
      : readableUri
        ? await scanImage(readableUri).catch(async (imageError) => {
            // Plik bez rozpoznawalnego typu, który nie jest obrazem - próbujemy jako PDF
            const asPdf = await scanPdf(file, null).catch(() => null);
            if (asPdf) return asPdf;
            throw imageError;
          })
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
        // Zdjęcie: odszyfrowana kopia do skalowania. PDF odszyfrowuje się w scanPdf.
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
