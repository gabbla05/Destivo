import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import QRCode from 'qrcode';
import { Buffer } from 'buffer';
import jsQR from 'jsqr';
import * as jpeg from 'jpeg-js';
import * as UPNG from 'upng-js';
import pako from 'pako';
import { getEmergencyNumber } from '../screens/HomeScreen';
import { translations } from '../i18n/translations';

export interface BriefingTrip {
  id: string;
  trip_name: string;
  origin?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
  transport_data?: string | any;
  lodging_data?: string | any;
  attractions_data?: string | any;
  created_at?: string;
}

export interface BriefingOptions {
  language?: 'pl' | 'en';
  includeQrCodes?: boolean;
}

export interface FormattedTicket {
  id: string;
  name: string;
  type: 'PDF' | 'IMAGE' | string;
  uri?: string;
  qrCodeDataUrl?: string;
  thumbnailDataUrl?: string;
  detectedQrCode?: string;
  detectedQrDataUrl?: string;
  croppedQrDataUrl?: string;
}

export interface FormattedDayEvent {
  time: string;
  title: string;
  subtitle?: string;
  type?: string;
}

export interface FormattedDay {
  dayNumber: number;
  dateStr: string;
  events: FormattedDayEvent[];
}

/**
 * Formatowanie daty do czytelnego formatu DD.MM.YYYY
 */
export const formatBriefingDate = (dateStr?: string | null, language: 'pl' | 'en' = 'pl'): string => {
  const t = translations[language].vault;
  if (!dateStr) return t.briefingPdfNoDate || (language === 'en' ? 'No date' : 'Brak daty');
  const clean = dateStr.replace(/\./g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  return dateStr;
};

/**
 * Parsowanie ciągu JSON lub obiektu
 */
const safeJsonParse = (input: any): any => {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
};

/**
 * Pomocnik waluty dla destynacji
 */
export const getCurrencyInfo = (destination?: string): { code: string; ratePln: number } => {
  if (!destination) return { code: 'EUR', ratePln: 4.30 };
  const d = destination.toLowerCase().trim();
  if (['warszawa', 'warsaw', 'kraków', 'krakow', 'gdańsk', 'wrocław', 'poznań', 'polska', 'poland'].some(c => d.includes(c))) {
    return { code: 'PLN', ratePln: 1.0 };
  }
  if (['londyn', 'london', 'uk', 'wielka brytania', 'anglia', 'england', 'szkocja', 'scotland'].some(c => d.includes(c))) {
    return { code: 'GBP', ratePln: 5.10 };
  }
  if (['praga', 'prague', 'czech', 'czechy'].some(c => d.includes(c))) {
    return { code: 'CZK', ratePln: 0.17 };
  }
  if (['budapeszt', 'budapest', 'węgry', 'hungary'].some(c => d.includes(c))) {
    return { code: 'HUF', ratePln: 0.011 };
  }
  if (['szwajcaria', 'switzerland', 'zurych', 'zurich', 'genewa'].some(c => d.includes(c))) {
    return { code: 'CHF', ratePln: 4.50 };
  }
  if (['tokio', 'tokyo', 'japonia', 'japan'].some(c => d.includes(c))) {
    return { code: 'JPY', ratePln: 0.026 };
  }
  if (['usa', 'nowy jork', 'new york', 'stany zjednoczone'].some(c => d.includes(c))) {
    return { code: 'USD', ratePln: 4.00 };
  }
  return { code: 'EUR', ratePln: 4.30 };
};

export interface ExtractedQrResult {
  qrData: string | null;
  croppedQrDataUrl: string | null;
}

/**
 * Wytnij kwadratowy wycinek z bufora RGBA wokół podanych współrzędnych [minX, maxX, minY, maxY]
 */
export const cropSquareFromRgba = (
  rgba: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  paddingRatio = 0.16
): string | null => {
  try {
    const side = Math.max(maxX - minX, maxY - minY);
    if (side <= 0 || imgWidth <= 0 || imgHeight <= 0) return null;

    const margin = Math.round(side * paddingRatio);
    const cropSide = side + 2 * margin;
    const cx = Math.round((minX + maxX) / 2);
    const cy = Math.round((minY + maxY) / 2);

    let cropX0 = Math.round(cx - cropSide / 2);
    let cropY0 = Math.round(cy - cropSide / 2);

    // Dopasowanie do krawędzi obrazu
    cropX0 = Math.max(0, Math.min(imgWidth - cropSide, cropX0));
    cropY0 = Math.max(0, Math.min(imgHeight - cropSide, cropY0));

    const actualSide = Math.min(cropSide, imgWidth - cropX0, imgHeight - cropY0);
    if (actualSide <= 0) return null;

    const croppedRgba = new Uint8Array(actualSide * actualSide * 4);
    for (let y = 0; y < actualSide; y++) {
      for (let x = 0; x < actualSide; x++) {
        const srcIdx = ((cropY0 + y) * imgWidth + (cropX0 + x)) * 4;
        const dstIdx = (y * actualSide + x) * 4;
        croppedRgba[dstIdx] = rgba[srcIdx];
        croppedRgba[dstIdx + 1] = rgba[srcIdx + 1];
        croppedRgba[dstIdx + 2] = rgba[srcIdx + 2];
        croppedRgba[dstIdx + 3] = rgba[srcIdx + 3];
      }
    }

    const pngBytes = (UPNG as any).encode([croppedRgba.buffer], actualSide, actualSide, 0);
    const base64 = Buffer.from(pngBytes).toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.warn('Błąd wycinania kwadratu z RGBA:', err);
    return null;
  }
};

/**
 * Wykrywanie kodu QR i wycinanie jego kwadratu z bufora RGBA w 100% offline
 */
export const detectAndCropQrFromRgba = (
  rgba: Uint8Array,
  width: number,
  height: number
): ExtractedQrResult => {
  if (!rgba || width <= 10 || height <= 10) {
    return { qrData: null, croppedQrDataUrl: null };
  }

  // 1. Podstawowy pełny skan za pomocą jsQR (normalny i odwrócony)
  try {
    const qr = (jsQR as any)(new Uint8ClampedArray(rgba), width, height, {
      inversionAttempts: 'attemptBoth',
    });
    if (qr && qr.location) {
      const pts = [
        qr.location.topLeftCorner,
        qr.location.topRightCorner,
        qr.location.bottomLeftCorner,
        qr.location.bottomRightCorner,
      ];
      const minX = Math.min(...pts.map((p: any) => p.x));
      const maxX = Math.max(...pts.map((p: any) => p.x));
      const minY = Math.min(...pts.map((p: any) => p.y));
      const maxY = Math.max(...pts.map((p: any) => p.y));
      const cropped = cropSquareFromRgba(rgba, width, height, minX, maxX, minY, maxY);
      return { qrData: qr.data || null, croppedQrDataUrl: cropped };
    }
  } catch (e) {}

  // 2. Skanowanie sekcyjne (dla długich zrzutów ekranu ze smartfona > 800px)
  if (height > 800) {
    const windows = [
      { y0: 0, y1: Math.min(height, Math.round(height * 0.6)) },
      { y0: Math.round(height * 0.25), y1: Math.min(height, Math.round(height * 0.75)) },
      { y0: Math.round(height * 0.45), y1: height },
    ];
    for (const win of windows) {
      try {
        const winH = win.y1 - win.y0;
        const winRgba = new Uint8Array(width * winH * 4);
        const startSrcIdx = win.y0 * width * 4;
        winRgba.set(rgba.subarray(startSrcIdx, startSrcIdx + winRgba.length));

        const qr = (jsQR as any)(new Uint8ClampedArray(winRgba), width, winH, {
          inversionAttempts: 'attemptBoth',
        });
        if (qr && qr.location) {
          const pts = [
            qr.location.topLeftCorner,
            qr.location.topRightCorner,
            qr.location.bottomLeftCorner,
            qr.location.bottomRightCorner,
          ];
          const minX = Math.min(...pts.map((p: any) => p.x));
          const maxX = Math.max(...pts.map((p: any) => p.x));
          const minY = Math.min(...pts.map((p: any) => p.y + win.y0));
          const maxY = Math.max(...pts.map((p: any) => p.y + win.y0));
          const cropped = cropSquareFromRgba(rgba, width, height, minX, maxX, minY, maxY);
          return { qrData: qr.data || null, croppedQrDataUrl: cropped };
        }
      } catch (e) {}
    }
  }

  // 3. Skanowanie ze skalowaniem 2x (dla obrazów wysokiej rozdzielczości > 900px)
  if (width > 900 || height > 900) {
    try {
      const dw = Math.floor(width / 2);
      const dh = Math.floor(height / 2);
      const downRgba = new Uint8Array(dw * dh * 4);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          const srcIdx = (y * 2 * width + x * 2) * 4;
          const dstIdx = (y * dw + x) * 4;
          downRgba[dstIdx] = rgba[srcIdx];
          downRgba[dstIdx + 1] = rgba[srcIdx + 1];
          downRgba[dstIdx + 2] = rgba[srcIdx + 2];
          downRgba[dstIdx + 3] = rgba[srcIdx + 3];
        }
      }
      const qr = (jsQR as any)(new Uint8ClampedArray(downRgba), dw, dh, {
        inversionAttempts: 'attemptBoth',
      });
      if (qr && qr.location) {
        const pts = [
          qr.location.topLeftCorner,
          qr.location.topRightCorner,
          qr.location.bottomLeftCorner,
          qr.location.bottomRightCorner,
        ];
        const minX = Math.min(...pts.map((p: any) => p.x * 2));
        const maxX = Math.max(...pts.map((p: any) => p.x * 2));
        const minY = Math.min(...pts.map((p: any) => p.y * 2));
        const maxY = Math.max(...pts.map((p: any) => p.y * 2));
        const cropped = cropSquareFromRgba(rgba, width, height, minX, maxX, minY, maxY);
        return { qrData: qr.data || null, croppedQrDataUrl: cropped };
      }
    } catch (e) {}
  }

  // 4. Wizualny skaner kwadratowych kodów 2D (kody Aztec linii lotniczych / PKP / zniekształcone QR)
  try {
    const step = 8;
    const gridW = Math.floor(width / step);
    const gridH = Math.floor(height / step);
    if (gridW >= 6 && gridH >= 6) {
      const energy = new Float32Array(gridW * gridH);
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          let trans = 0;
          for (let dy = 0; dy < step; dy++) {
            for (let dx = 0; dx < step - 1; dx++) {
              const px = gx * step + dx;
              const py = gy * step + dy;
              const idx1 = (py * width + px) * 4;
              const idx2 = (py * width + (px + 1)) * 4;
              const lum1 = (rgba[idx1] + rgba[idx1 + 1] + rgba[idx1 + 2]) / 3;
              const lum2 = (rgba[idx2] + rgba[idx2 + 1] + rgba[idx2 + 2]) / 3;
              if (Math.abs(lum1 - lum2) > 60) trans++;
            }
          }
          energy[gy * gridW + gx] = trans;
        }
      }

      const candidateSizes = [10, 16, 24, 32].filter(s => s < gridW && s < gridH);
      let bestDensity = 0;
      let bestX = 0, bestY = 0, bestSizePx = 0;

      for (const winSize of candidateSizes) {
        const area = winSize * winSize;
        for (let gy = 0; gy <= gridH - winSize; gy += 2) {
          for (let gx = 0; gx <= gridW - winSize; gx += 2) {
            let sum = 0;
            for (let dy = 0; dy < winSize; dy++) {
              for (let dx = 0; dx < winSize; dx++) {
                sum += energy[(gy + dy) * gridW + (gx + dx)];
              }
            }
            const density = sum / area;
            if (density > bestDensity) {
              bestDensity = density;
              bestX = gx * step;
              bestY = gy * step;
              bestSizePx = winSize * step;
            }
          }
        }
      }

      if (bestDensity > 7.5 && bestSizePx >= 40) {
        const cropped = cropSquareFromRgba(
          rgba,
          width,
          height,
          bestX,
          bestX + bestSizePx,
          bestY,
          bestY + bestSizePx,
          0.12
        );
        if (cropped) {
          return { qrData: null, croppedQrDataUrl: cropped };
        }
      }
    }
  } catch (e) {}

  return { qrData: null, croppedQrDataUrl: null };
};

/**
 * Wykrywanie kodu QR z bufora obrazu (PNG lub JPEG) oraz wycięcie kwadratu z kodem w 100% offline
 */
export const detectAndCropQrFromImage = (
  buffer: Buffer,
  isPng: boolean
): ExtractedQrResult => {
  if (!buffer || buffer.length === 0) {
    return { qrData: null, croppedQrDataUrl: null };
  }

  // 1. Próba UPNG (jeśli to PNG)
  if (isPng) {
    try {
      const img = (UPNG as any).decode(buffer);
      if (img && img.width > 0 && img.height > 0) {
        const rgbaArr = (UPNG as any).toRGBA8(img)[0];
        const res = detectAndCropQrFromRgba(new Uint8Array(rgbaArr), img.width, img.height);
        if (res.qrData || res.croppedQrDataUrl) return res;
      }
    } catch (e) {}
  }

  // 2. Próba JPEG
  try {
    const dec = (jpeg as any).decode(buffer, { useTArray: true });
    if (dec && dec.data && dec.width > 0 && dec.height > 0) {
      const rgba = new Uint8Array(dec.data.buffer || dec.data);
      const res = detectAndCropQrFromRgba(rgba, dec.width, dec.height);
      if (res.qrData || res.croppedQrDataUrl) return res;
    }
  } catch (e) {}

  // 3. Odwrotny fallback (np. JPEG z rozszerzeniem .png lub na odwrót)
  if (!isPng) {
    try {
      const img = (UPNG as any).decode(buffer);
      if (img && img.width > 0 && img.height > 0) {
        const rgbaArr = (UPNG as any).toRGBA8(img)[0];
        const res = detectAndCropQrFromRgba(new Uint8Array(rgbaArr), img.width, img.height);
        if (res.qrData || res.croppedQrDataUrl) return res;
      }
    } catch (e) {}
  }

  return { qrData: null, croppedQrDataUrl: null };
};

/**
 * Wykrywanie kodu QR z bufora obrazu (dla kompatybilności wstecznej)
 */
export const extractQrFromImageBuffer = (buffer: Buffer, isPng: boolean): string | null => {
  return detectAndCropQrFromImage(buffer, isPng).qrData;
};

/**
 * Wykrywanie kodu QR lub danych biletu z pliku PDF oraz wycięcie kwadratu z kodem w 100% offline
 */
export const detectAndCropQrFromPdf = (buffer: Buffer): ExtractedQrResult => {
  try {
    // 1. Skanowanie bezpośrednich osadzonych obrazów JPEG (DCTDecode) wewnątrz PDF
    let start = -1;
    for (let i = 0; i < buffer.length - 2; i++) {
      if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
        start = i;
      }
      if (start !== -1 && buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
        const slice = buffer.slice(start, i + 2);
        start = -1;
        if (slice.length > 250) {
          try {
            const res = detectAndCropQrFromImage(slice, false);
            if (res.croppedQrDataUrl || res.qrData) {
              return res;
            }
            // Jeśli osadzony obraz JPEG jest kwadratowy (np. 60x60 - 600x600 px z kodem biletu)
            const dec = (jpeg as any).decode(slice, { useTArray: true });
            if (dec && dec.width >= 50 && dec.height >= 50) {
              const ratio = dec.width / dec.height;
              if (ratio >= 0.8 && ratio <= 1.25) {
                return {
                  qrData: null,
                  croppedQrDataUrl: `data:image/jpeg;base64,${slice.toString('base64')}`,
                };
              }
            }
          } catch (e) {}
        }
      }
    }

    // 2. Skanowanie tekstu w poszukiwaniu linków lub kodów odprawy online
    const pdfStr = buffer.toString('latin1');
    const urlMatch = pdfStr.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g);
    if (urlMatch) {
      for (const u of urlMatch) {
        const lowerU = u.toLowerCase();
        if (
          lowerU.includes('ticket') ||
          lowerU.includes('pass') ||
          lowerU.includes('boarding') ||
          lowerU.includes('booking') ||
          lowerU.includes('pkp') ||
          lowerU.includes('ryanair') ||
          lowerU.includes('wizz') ||
          lowerU.includes('checkin')
        ) {
          return { qrData: u, croppedQrDataUrl: null };
        }
      }
    }
  } catch (err) {
    console.warn('Błąd podczas analizy pliku PDF w poszukiwaniu kodu QR:', err);
  }

  return { qrData: null, croppedQrDataUrl: null };
};

/**
 * Wykrywanie kodu QR lub danych biletu z pliku PDF (dla kompatybilności wstecznej)
 */
export const extractQrFromPdfBuffer = (buffer: Buffer): string | null => {
  return detectAndCropQrFromPdf(buffer).qrData;
};

/**
 * Przygotowanie biletów z Sejfu i wygenerowanie dla nich kodów QR w 100% offline
 */
export const prepareVaultTickets = async (
  lodgingData: any,
  transportData: any,
  tripId: string,
  language: 'pl' | 'en' = 'pl'
): Promise<FormattedTicket[]> => {
  const files: any[] = [];
  const fallbackDocName = language === 'en' ? 'Travel document' : 'Dokument podróży';

  // 1. Pliki z lodging_data.vaultFiles
  if (Array.isArray(lodgingData?.vaultFiles)) {
    files.push(...lodgingData.vaultFiles);
  }

  // 2. Bilet z transport_data.details.ticketFile (jeśli nie był jeszcze dodany)
  const transportTicket = transportData?.details?.ticketFile || transportData?.ticketFile;
  if (transportTicket && !files.some(f => f.id === transportTicket.id || f.name === transportTicket.name)) {
    files.push(transportTicket);
  }

  const result: FormattedTicket[] = [];

  for (const file of files) {
    const fileName = file.name || fallbackDocName;
    const lowerName = fileName.toLowerCase();
    const lowerUri = (file.uri || '').toLowerCase();

    // Wykrycie, czy plik to obraz (zrzut ekranu karty pokładowej / biletu z kodem QR)
    const isImage =
      file.type === 'IMAGE' ||
      file.type?.startsWith?.('image/') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.webp') ||
      lowerUri.endsWith('.png') ||
      lowerUri.endsWith('.jpg') ||
      lowerUri.endsWith('.jpeg') ||
      lowerUri.endsWith('.webp');

    const isPdf = !isImage && (file.type === 'PDF' || lowerName.endsWith('.pdf') || lowerUri.endsWith('.pdf'));
    const fileType = isImage ? 'IMAGE' : (isPdf ? 'PDF' : (file.type || 'DOC'));

    let detectedQrCode: string | undefined = undefined;
    let detectedQrDataUrl: string | undefined = undefined;
    let croppedQrDataUrl: string | undefined = undefined;
    let thumbnailDataUrl: string | undefined = undefined;

    // Odczyt pliku i zaawansowana detekcja kodów QR z biletów oraz wycięcie kwadratu
    if (file.uri) {
      try {
        const uriToRead = file.uri.startsWith('file://') || file.uri.startsWith('content://')
          ? file.uri
          : `file://${file.uri}`;
        const base64 = await FileSystem.readAsStringAsync(uriToRead, {
          encoding: 'base64',
        });
        if (base64) {
          const fileBuf = Buffer.from(base64, 'base64');
          if (isImage) {
            const isPng = lowerName.endsWith('.png') || uriToRead.toLowerCase().endsWith('.png');
            const isWebp = lowerName.endsWith('.webp') || uriToRead.toLowerCase().endsWith('.webp');
            const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
            thumbnailDataUrl = `data:${mime};base64,${base64}`;

            // Skanujemy zrzut ekranu w poszukiwaniu kodu QR i wycinamy kwadrat z kodem
            const res = detectAndCropQrFromImage(fileBuf, isPng);
            if (res.qrData) detectedQrCode = res.qrData;
            if (res.croppedQrDataUrl) croppedQrDataUrl = res.croppedQrDataUrl;
          } else if (isPdf) {
            // Skanujemy plik PDF w poszukiwaniu osadzonego kodu QR i wycinamy kwadrat
            const res = detectAndCropQrFromPdf(fileBuf);
            if (res.qrData) detectedQrCode = res.qrData;
            if (res.croppedQrDataUrl) croppedQrDataUrl = res.croppedQrDataUrl;
          }
        }
      } catch (err) {
        console.warn('Nie udało się przeanalizować pliku z Sejfu:', err);
      }
    }

    // Jeśli wykryto oryginalny kod QR z biletu (ze zdjęcia lub z PDF):
    // Generujemy duży, nieskazitelny, wektorowy kod QR w 100% offline
    if (detectedQrCode) {
      try {
        detectedQrDataUrl = await QRCode.toDataURL(detectedQrCode, {
          margin: 2,
          width: 320,
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
      } catch (e) {
        console.warn('Błąd generowania wykrytego kodu QR:', e);
      }
    }

    // Awaryjny kod QR metadanych (jeśli w pliku nie ma odczytywalnego kodu)
    let fallbackQrDataUrl = '';
    const qrPayload = JSON.stringify({
      destivo_vault_pass: true,
      trip_id: tripId,
      doc_id: file.id || file.name,
      title: fileName,
      type: fileType,
      secured_at: file.createdAt || new Date().toISOString().split('T')[0],
    });
    try {
      fallbackQrDataUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 220,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
    } catch (e) {}

    result.push({
      id: file.id || String(Math.random()),
      name: fileName,
      type: fileType,
      uri: file.uri,
      qrCodeDataUrl: detectedQrDataUrl || croppedQrDataUrl || fallbackQrDataUrl,
      thumbnailDataUrl,
      detectedQrCode,
      detectedQrDataUrl,
      croppedQrDataUrl,
    });
  }

  return result;
};

/**
 * Przygotowanie planu dzień po dniu
 */
export const prepareDayByDayPlan = (
  trip: BriefingTrip,
  attractionsData: any,
  transportData: any,
  lodgingData: any,
  language: 'pl' | 'en' = 'pl'
): FormattedDay[] => {
  const daysMap = new Map<string, FormattedDayEvent[]>();
  const isEn = language === 'en';
  const t = translations[language].vault;

  // Sprawdzamy, czy istnieje customTimeline
  if (Array.isArray(attractionsData?.customTimeline) && attractionsData.customTimeline.length > 0) {
    for (const evt of attractionsData.customTimeline) {
      const dateKey = evt.dateStr || formatBriefingDate(trip.start_date, language);
      if (!daysMap.has(dateKey)) {
        daysMap.set(dateKey, []);
      }
      daysMap.get(dateKey)!.push({
        time: evt.timeStr || '12:00',
        title: evt.title || (isEn ? 'Activity' : 'Aktywność'),
        subtitle: evt.subtitle || '',
        type: evt.type || 'ATTRACTION',
      });
    }
  } else {
    // Generujemy plan awaryjny na podstawie dat i wybranych atrakcji
    const startDate = formatBriefingDate(trip.start_date, language);
    const endDate = formatBriefingDate(trip.end_date, language);

    const originText = trip.origin || (t.briefingPdfOriginFallback || (isEn ? 'Origin' : 'Miejsce wyjazdu'));
    const destText = trip.destination || (t.briefingPdfDestFallback || (isEn ? 'Destination' : 'Cel podróży'));
    const depLabel = t.briefingPdfDepFallback || (isEn ? 'Departure' : 'Wyjazd');
    const hotelCheckIn = t.briefingPdfCheckInFallback || (isEn ? 'Hotel Check-in' : 'Zakwaterowanie w hotelu');
    const checkInSub = lodgingData?.lodgingAddress || (t.briefingPdfCheckInSubFallback || (isEn ? 'Check-in and key pickup' : 'Zameldowanie i odbiór kluczy'));
    const sightseeingSub = t.briefingPdfSightseeingFallback || (isEn ? 'Sightseeing and free time' : 'Zwiedzanie i czas wolny');
    const returnLabel = t.briefingPdfReturnFallback || (isEn ? 'Return' : 'Powrót');
    const returnSub = `${t.briefingPdfReturnSubFallback || (isEn ? 'Return journey' : 'Transport powrotny')} • ${transportData?.details?.returnDepartureTime || '12:00'}`;

    // Dzień 1: Wyjazd i Zakwaterowanie
    daysMap.set(startDate, [
      {
        time: transportData?.details?.outboundDepartureTime || '08:00',
        title: `${depLabel}: ${originText} ➔ ${destText}`,
        subtitle: `Transport: ${(transportData?.selectedOption?.type || (isEn ? 'Flight / Train' : 'Samolot / Pociąg')).toUpperCase()}`,
        type: 'DEPARTURE',
      },
      {
        time: transportData?.details?.outboundArrivalTime || '14:00',
        title: hotelCheckIn,
        subtitle: checkInSub,
        type: 'LODGING',
      },
    ]);

    // Dni zwiedzania z wybranych atrakcji
    const selectedList: string[] = attractionsData?.selected || [];
    if (selectedList.length > 0) {
      selectedList.forEach((attraction, idx) => {
        const dayDate = startDate; // Upraszczamy do dni podróży
        const eventHour = 10 + (idx % 6);
        const timeStr = `${String(eventHour).padStart(2, '0')}:00`;
        daysMap.get(dayDate)!.push({
          time: timeStr,
          title: attraction,
          subtitle: sightseeingSub,
          type: 'ATTRACTION',
        });
      });
    }

    // Dzień powrotu
    if (!daysMap.has(endDate)) {
      daysMap.set(endDate, []);
    }
    daysMap.get(endDate)!.push({
      time: transportData?.details?.returnDepartureTime || '12:00',
      title: `${returnLabel}: ${destText} ➔ ${originText}`,
      subtitle: returnSub,
      type: 'RETURN',
    });
  }

  // Konwersja Map do tablicy FormattedDay
  const result: FormattedDay[] = [];
  let dayCounter = 1;

  daysMap.forEach((events, dateStr) => {
    // Sortowanie chronologiczne w ramach danego dnia
    events.sort((a, b) => a.time.localeCompare(b.time));
    result.push({
      dayNumber: dayCounter++,
      dateStr,
      events,
    });
  });

  return result;
};

/**
 * Generator czystego, zwartego kodu HTML zoptymalizowanego pod A4 (100% offline)
 */
export const generateBriefingHtml = async (
  trip: BriefingTrip,
  options?: BriefingOptions
): Promise<string> => {
  const language = options?.language === 'en' ? 'en' : 'pl';
  const isEn = language === 'en';
  const t = translations[language].vault;

  const transportData = safeJsonParse(trip.transport_data);
  const lodgingData = safeJsonParse(trip.lodging_data);
  const attractionsData = safeJsonParse(trip.attractions_data);

  const destination = trip.destination || (t.briefingPdfDestFallback || (isEn ? 'Trip Destination' : 'Cel podróży'));
  const origin = trip.origin || (t.briefingPdfOriginFallback || (isEn ? 'Origin' : 'Początek'));
  const tripTitle = trip.trip_name || `${t.briefingPdfTripFallback || (isEn ? 'Trip to' : 'Podróż do')} ${destination}`;
  const startDate = formatBriefingDate(trip.start_date, language);
  const endDate = formatBriefingDate(trip.end_date, language);

  const emergencyNum = getEmergencyNumber(destination);
  const currencyInfo = getCurrencyInfo(destination);
  const lodgingAddress = lodgingData?.lodgingAddress || (t.briefingPdfNoLodging || (isEn ? 'No hotel address provided' : 'Brak zapisanego adresu noclegu'));

  // Szczegóły transportu
  const outboundDepLoc = transportData?.details?.outboundDepartureLocation || origin;
  const outboundArrLoc = transportData?.details?.outboundArrivalLocation || destination;
  const outboundDepTime = transportData?.details?.outboundDepartureTime || '08:00';
  const outboundArrTime = transportData?.details?.outboundArrivalTime || '11:30';

  const returnDepLoc = transportData?.details?.returnDepartureLocation || destination;
  const returnArrLoc = transportData?.details?.returnArrivalLocation || origin;
  const returnDepTime = transportData?.details?.returnDepartureTime || '14:00';
  const returnArrTime = transportData?.details?.returnArrivalTime || '17:30';
  const transportType = (transportData?.selectedOption?.type || (isEn ? 'Flight / Train' : 'Samolot / Pociąg')).toUpperCase();

  // Plan dzień po dniu
  const days = prepareDayByDayPlan(trip, attractionsData, transportData, lodgingData, language);

  // Główny paszportowy kod QR podróży (zawiera wszystkie kluczowe dane w nagłówku)
  const masterQrPayload = JSON.stringify({
    app: 'DESTIVO_OFFLINE_BRIEFING',
    trip: tripTitle,
    route: `${origin} -> ${destination}`,
    dates: `${startDate} - ${endDate}`,
    hotel: lodgingAddress,
    sos: emergencyNum,
    generated: new Date().toISOString(),
  });

  let masterQrDataUrl = '';
  try {
    masterQrDataUrl = await QRCode.toDataURL(masterQrPayload, {
      margin: 1,
      width: 240,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  } catch (e) {
    console.warn('Master QR generation error:', e);
  }

  const generatedDateStr = new Date().toLocaleString(isEn ? 'en-US' : 'pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${tripTitle} - Destivo Offline Travel Briefing</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
    }
    .page-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    /* HEADER */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .header-main {
      flex: 1;
      padding-right: 16px;
    }
    .brand-badge {
      display: inline-block;
      background-color: #0F172A;
      color: #F8FAFC;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.5px;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .trip-title {
      font-size: 22px;
      font-weight: 800;
      color: #0F172A;
      margin: 0 0 4px 0;
      line-height: 1.2;
    }
    .trip-route {
      font-size: 13px;
      font-weight: 600;
      color: #0284C7;
      margin-bottom: 4px;
    }
    .trip-dates {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
    }
    .header-qr-box {
      text-align: center;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 6px 8px;
      width: 105px;
    }
    .header-qr-box img {
      width: 80px;
      height: 80px;
      display: block;
      margin: 0 auto 3px auto;
    }
    .header-qr-caption {
      font-size: 7.5px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* EMERGENCY & ESSENTIALS GRID */
    .essentials-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .essential-card {
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #E2E8F0;
      background: #F8FAFC;
    }
    .card-emergency {
      background: #FEF2F2;
      border-color: #FECACA;
    }
    .card-hotel {
      background: #F0F9FF;
      border-color: #BAE6FD;
    }
    .card-transport {
      background: #F8FAFC;
      border-color: #E2E8F0;
    }
    .card-title {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
    }
    .card-emergency .card-title { color: #DC2626; }
    .card-hotel .card-title { color: #0284C7; }
    .card-transport .card-title { color: #0F172A; }
    
    .emergency-number-main {
      font-size: 18px;
      font-weight: 900;
      color: #DC2626;
      margin: 2px 0 4px 0;
    }
    .essential-desc {
      font-size: 9.5px;
      color: #334155;
      line-height: 1.35;
    }
    .essential-highlight {
      font-weight: 700;
      color: #0F172A;
    }

    /* SECTION TITLES */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #CBD5E1;
      padding-bottom: 4px;
      margin: 14px 0 8px 0;
    }
    .section-title {
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .section-badge {
      font-size: 8.5px;
      color: #64748B;
      font-weight: 600;
    }

    /* TRANSPORT DETAILS ROW */
    .transport-boxes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .transport-box {
      border: 1px solid #E2E8F0;
      background: #FFFFFF;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .transport-leg-title {
      font-size: 9.5px;
      font-weight: 700;
      color: #0284C7;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .transport-time-row {
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .transport-loc {
      font-size: 10px;
      color: #475569;
    }
    .sec-icon {
      vertical-align: -2px;
      margin-right: 5px;
      display: inline-block;
      flex-shrink: 0;
    }

    /* ITINERARY DAY BY DAY */
    .itinerary-container {
      margin-bottom: 14px;
    }
    .day-block {
      margin-bottom: 8px;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .day-header {
      background: #F1F5F9;
      padding: 5px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #0F172A;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #E2E8F0;
    }
    .day-events-table {
      width: 100%;
      border-collapse: collapse;
      background: #FFFFFF;
    }
    .day-events-table td {
      padding: 5px 10px;
      border-bottom: 1px solid #F1F5F9;
      font-size: 10px;
    }
    .day-events-table tr:last-child td {
      border-bottom: none;
    }
    .col-time {
      width: 60px;
      font-weight: 800;
      color: #0284C7;
      white-space: nowrap;
    }
    .col-title {
      font-weight: 600;
      color: #0F172A;
    }
    .col-subtitle {
      font-size: 9px;
      color: #64748B;
      margin-top: 1px;
    }

    /* FOOTER */
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #94A3B8;
    }
    .footer-left {
      max-width: 75%;
    }
    .footer-warning {
      font-weight: 600;
      color: #64748B;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <!-- HEADER -->
    <div class="header">
      <div class="header-main">
        <div class="brand-badge">${t.briefingPdfHeaderBadge || 'DESTIVO • OFFLINE TRAVEL BRIEFING'}</div>
        <h1 class="trip-title">${tripTitle}</h1>
        <div class="trip-route"><svg class="sec-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${origin} ➔ ${destination}</div>
        <div class="trip-dates">${startDate} – ${endDate} • ${t.briefingPdfSubtitle || (isEn ? 'Emergency Survival Document' : 'Awaryjny dokument podróżny bez roamingu')}</div>
      </div>
      ${masterQrDataUrl ? `
      <div class="header-qr-box">
        <img src="${masterQrDataUrl}" alt="Trip QR" />
        <div class="header-qr-caption">${t.briefingPdfPassCaption || 'OFFLINE PASS'}</div>
      </div>
      ` : ''}
    </div>

    <!-- ESSENTIALS & EMERGENCY (RED & BLUE HIGHLIGHTS) -->
    <div class="essentials-grid">
      <!-- 1. NUMERY ALARMOWE -->
      <div class="essential-card card-emergency">
        <div class="card-title"><svg class="sec-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>${t.briefingPdfEmergencyTitle || (isEn ? 'Emergency Numbers' : 'Numery Alarmowe')}</div>
        <div class="emergency-number-main">${emergencyNum}</div>
        <div class="essential-desc">
          <span class="essential-highlight">${t.briefingPdfEmergencyServices || (isEn ? 'Police • Ambulance • Fire' : 'Policja • Pogotowie • Straż')}</span><br />
          ${t.briefingPdfEmergencyNoSim || (isEn ? 'Operates without SIM or roaming.' : 'Działa bez karty SIM i bez roamingu.')}<br />
          ${t.briefingPdfConsularSos || (isEn ? 'Consular SOS: +48 22 523 8888' : 'Dyżurny MSZ RP: +48 22 523 8888')}
        </div>
      </div>

      <!-- 2. HOTEL & ADRES -->
      <div class="essential-card card-hotel">
        <div class="card-title"><svg class="sec-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"></path></svg>${t.briefingPdfLodgingTitle || (isEn ? 'Lodging & Address' : 'Adres Hotelu / Noclegu')}</div>
        <div class="essential-desc">
          <span class="essential-highlight">${lodgingAddress}</span><br />
          ${t.briefingPdfLodgingTip || (isEn ? 'Show this address at border control or to taxi drivers.' : 'Podaj ten adres na granicy lub taksówkarzowi.')}
        </div>
      </div>

      <!-- 3. WALUTA & WSKAZÓWKI -->
      <div class="essential-card card-transport">
        <div class="card-title"><svg class="sec-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>${t.briefingPdfCurrencyTitle || (isEn ? 'Currency & Safety' : 'Waluta & Płatności')}</div>
        <div class="essential-desc">
          <span class="essential-highlight">${currencyInfo.code}</span> (1 ${currencyInfo.code} ≈ ${currencyInfo.ratePln} PLN)<br />
          ${t.briefingPdfCurrencyTip || (isEn ? 'Keep paper copy in cabin baggage.' : 'Miej ten wydruk w bagażu podręcznym na wypadek rozładowania baterii.')}
        </div>
      </div>
    </div>

    <!-- TRANSPORT GODZINY LOTÓW/POCIĄGÓW -->
    <div class="section-header">
      <div class="section-title"><svg class="sec-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"></path></svg>${t.briefingPdfTransportTitle || (isEn ? 'Transport & Flight / Train Schedule' : 'Transport & Godziny Połączeń')}</div>
      <div class="section-badge">${transportType}</div>
    </div>

    <div class="transport-boxes">
      <div class="transport-box">
        <div class="transport-leg-title">➔ ${t.briefingPdfOutbound || (isEn ? 'Outbound Journey' : 'Dojazd / Wylot')}</div>
        <div class="transport-time-row">${outboundDepTime} ➔ ${outboundArrTime}</div>
        <div class="transport-loc"><strong>${outboundDepLoc}</strong> ➔ <strong>${outboundArrLoc}</strong></div>
      </div>
      <div class="transport-box">
        <div class="transport-leg-title">➔ ${t.briefingPdfReturn || (isEn ? 'Return Journey' : 'Powrót')}</div>
        <div class="transport-time-row">${returnDepTime} ➔ ${returnArrTime}</div>
        <div class="transport-loc"><strong>${returnDepLoc}</strong> ➔ <strong>${returnArrLoc}</strong></div>
      </div>
    </div>

    <!-- PLAN DZIEŃ PO DNIU -->
    <div class="section-header">
      <div class="section-title"><svg class="sec-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${t.briefingPdfItineraryTitle || (isEn ? 'Day-by-Day Itinerary' : 'Plan Dzień po Dniu')}</div>
      <div class="section-badge">${days.length} ${t.briefingPdfDaysCount || (isEn ? 'days' : 'dni')}</div>
    </div>

    <div class="itinerary-container">
      ${days.map((day) => `
        <div class="day-block">
          <div class="day-header">
            <span>${t.briefingPdfDayLabel || (isEn ? 'DAY' : 'DZIEŃ')} ${day.dayNumber}</span>
            <span>${day.dateStr}</span>
          </div>
          <table class="day-events-table">
            <tbody>
              ${day.events.map((evt) => `
                <tr>
                  <td class="col-time">${evt.time}</td>
                  <td>
                    <div class="col-title">${evt.title}</div>
                    ${evt.subtitle ? `<div class="col-subtitle">${evt.subtitle}</div>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-left">
        <div class="footer-warning"><svg class="sec-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>${t.briefingPdfFooterWarning || (isEn ? '100% Client-Side Offline Document' : 'Dokument wygenerowany w 100% offline przez aplikację Destivo')}</div>
        <div>${t.briefingPdfFooterTip || (isEn ? 'Keep printed copy in hand luggage in case of smartphone battery drain, loss, or lack of roaming.' : 'Miej wydrukowaną kopię w bagażu podręcznym na wypadek rozładowania baterii, kradzieży telefonu lub braku roamingu.')}</div>
      </div>
      <div>
        ${t.briefingPdfGenerated || (isEn ? 'Generated:' : 'Wygenerowano:')} ${generatedDateStr}
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Główna funkcja generująca dokument PDF z planem i biletami
 */
export const generateOfflineTravelBriefingPdf = async (
  trip: BriefingTrip,
  options?: BriefingOptions
): Promise<{ uri: string; html: string }> => {
  const html = await generateBriefingHtml(trip, options);

  // Generowanie prawdziwego pliku PDF za pomocą expo-print
  const fileResult = await Print.printToFileAsync({
    html,
  });

  return {
    uri: fileResult.uri,
    html,
  };
};

/**
 * Udostępnianie wygenerowanego PDF (e-mail, WhatsApp, Dysk, Zapisz plik)
 */
export const shareTravelBriefingPdf = async (
  pdfUri: string,
  tripName: string
): Promise<boolean> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) return false;

  await Sharing.shareAsync(pdfUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Destivo Travel Briefing - ${tripName}`,
    UTI: '.pdf',
  });
  return true;
};

/**
 * Bezpośrednie drukowanie dokumentu (AirPrint / Usługi drukowania Android)
 */
export const printTravelBriefingDirectly = async (html: string): Promise<void> => {
  await Print.printAsync({
    html,
  });
};

/**
 * Zapis kopii wygenerowanego briefingu do Sejfu wycieczki
 */
export const saveBriefingToVaultStorage = async (
  pdfUri: string,
  tripId: string,
  tripName: string
): Promise<any> => {
  try {
    const vaultDir = `${FileSystem.documentDirectory}destivo_vault/`;
    const dirInfo = await FileSystem.getInfoAsync(vaultDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
    }

    const cleanName = `Briefing_${tripName.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    const permanentUri = `${vaultDir}${Crypto.randomUUID()}.pdf`;

    await FileSystem.copyAsync({
      from: pdfUri,
      to: permanentUri,
    });

    return {
      id: Crypto.randomUUID(),
      name: cleanName,
      uri: permanentUri,
      type: 'PDF',
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to save briefing in vault:', err);
    return null;
  }
};

/**
 * Bezpośrednie drukowanie dowolnego pliku z Sejfu (PDF lub Obraz) za pomocą expo-print
 */
export const printVaultFile = async (file: { name?: string; uri: string; type?: string }): Promise<void> => {
  if (!file?.uri) return;
  const isImage =
    file.type === 'IMAGE' ||
    file.type?.startsWith?.('image/') ||
    /\.(jpg|jpeg|png|webp)$/i.test(file.uri) ||
    /\.(jpg|jpeg|png|webp)$/i.test(file.name || '');

  if (isImage) {
    let imageSrc = file.uri;
    try {
      const uriToRead = file.uri.startsWith('file://') || file.uri.startsWith('content://')
        ? file.uri
        : `file://${file.uri}`;
      const base64 = await FileSystem.readAsStringAsync(uriToRead, { encoding: 'base64' });
      if (base64) {
        const isPng = (file.name || file.uri).toLowerCase().endsWith('.png');
        imageSrc = `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${base64}`;
      }
    } catch (e) {}

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${file.name || 'Dokument'}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0F172A;
      text-align: center;
    }
    .header {
      margin-bottom: 14px;
      border-bottom: 1.5px solid #E2E8F0;
      padding-bottom: 8px;
    }
    .title { font-size: 15px; font-weight: 800; margin: 0; }
    .badge { font-size: 8px; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 3px; }
    .img-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      max-height: 88vh;
    }
    img {
      max-width: 100%;
      max-height: 85vh;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${file.name || 'Dokument z Sejfu Destivo'}</h1>
    <div class="badge">DESTIVO VAULT • WYDRUK PLIKU</div>
  </div>
  <div class="img-wrap">
    <img src="${imageSrc}" alt="${file.name || 'Dokument'}" />
  </div>
</body>
</html>
    `;
    await Print.printAsync({ html });
  } else {
    // Plik PDF - natywne drukowanie przez expo-print
    await Print.printAsync({ uri: file.uri });
  }
};
