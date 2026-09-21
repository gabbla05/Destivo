/// <reference types="jest" />
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  formatBriefingDate,
  getCurrencyInfo,
  prepareVaultTickets,
  prepareDayByDayPlan,
  generateBriefingHtml,
  generateOfflineTravelBriefingPdf,
  shareTravelBriefingPdf,
  printTravelBriefingDirectly,
  saveBriefingToVaultStorage,
  printVaultFile,
  extractQrFromImageBuffer,
  extractQrFromPdfBuffer,
  detectAndCropQrFromImage,
  detectAndCropQrFromPdf,
  cropSquareFromRgba,
  BriefingTrip,
} from '../src/lib/offlineTravelBriefing';
import QRCode from 'qrcode';
import { Buffer } from 'buffer';
import * as jpeg from 'jpeg-js';
import * as UPNG from 'upng-js';

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(true),
}));

// Mock expo-file-system/legacy
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://mock_app_dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(true),
  copyAsync: jest.fn().mockResolvedValue(true),
  readAsStringAsync: jest.fn().mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
}));

describe('Moduł Generatora Offline Travel Briefing (100% Offline)', () => {
  const sampleTrip: BriefingTrip = {
    id: 'trip-rome-101',
    trip_name: 'Rzymska Przygoda 2026',
    origin: 'Warszawa',
    destination: 'Rzym',
    start_date: '2026-10-10',
    end_date: '2026-10-15',
    transport_data: JSON.stringify({
      selectedOption: { type: 'flight' },
      details: {
        outboundDepartureLocation: 'Warszawa Chopin (WAW)',
        outboundArrivalLocation: 'Rzym Fiumicino (FCO)',
        outboundDepartureTime: '07:15',
        outboundArrivalTime: '09:40',
        returnDepartureLocation: 'Rzym Fiumicino (FCO)',
        returnArrivalLocation: 'Warszawa Chopin (WAW)',
        returnDepartureTime: '18:20',
        returnArrivalTime: '20:45',
      },
    }),
    lodging_data: JSON.stringify({
      type: 'hotel',
      lodgingAddress: 'Via del Corso 180, 00186 Roma RM, Włochy',
      vaultFiles: [
        {
          id: 'file-ryanair-1',
          name: 'Karta_pokladowa_Ryanair.pdf',
          type: 'PDF',
          uri: 'file://mock_app_dir/destivo_vault/ryanair.pdf',
        },
        {
          id: 'file-hotel-booking-2',
          name: 'Rezerwacja_Booking_Hotel.jpg',
          type: 'IMAGE',
          uri: 'file://mock_app_dir/destivo_vault/booking.jpg',
        },
      ],
    }),
    attractions_data: JSON.stringify({
      customTimeline: [
        {
          id: 'evt-1',
          title: 'Wylot z Warszawy do Rzymu',
          subtitle: 'Lotnisko Chopina • Terminal A',
          dateStr: '10.10.2026',
          timeStr: '07:15',
          type: 'DEPARTURE',
        },
        {
          id: 'evt-2',
          title: 'Zameldowanie w Hotelu',
          subtitle: 'Via del Corso 180',
          dateStr: '10.10.2026',
          timeStr: '12:00',
          type: 'LODGING',
        },
        {
          id: 'evt-3',
          title: 'Koloseum i Forum Romanum',
          subtitle: 'Bilety wstępu zarezerwowane',
          dateStr: '11.10.2026',
          timeStr: '10:00',
          type: 'ATTRACTION',
        },
        {
          id: 'evt-4',
          title: 'Watykan i Bazylika św. Piotra',
          subtitle: 'Zwiedzanie z przewodnikiem',
          dateStr: '12.10.2026',
          timeStr: '09:30',
          type: 'ATTRACTION',
        },
      ],
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Formatowanie dat i walut', () => {
    test('formatBriefingDate poprawnie formatuje daty YYYY-MM-DD na DD.MM.YYYY', () => {
      expect(formatBriefingDate('2026-10-10')).toBe('10.10.2026');
      expect(formatBriefingDate('10.10.2026')).toBe('10.10.2026');
      expect(formatBriefingDate(null)).toBe('Brak daty');
      expect(formatBriefingDate(undefined)).toBe('Brak daty');
    });

    test('getCurrencyInfo poprawnie rozpoznaje walutę destynacji', () => {
      expect(getCurrencyInfo('Rzym').code).toBe('EUR');
      expect(getCurrencyInfo('Londyn').code).toBe('GBP');
      expect(getCurrencyInfo('Nowy Jork').code).toBe('USD');
      expect(getCurrencyInfo('Praga').code).toBe('CZK');
      expect(getCurrencyInfo('Tokio').code).toBe('JPY');
      expect(getCurrencyInfo('Kraków').code).toBe('PLN');
    });
  });

  describe('2. Przetwarzanie biletów z Sejfu i generowanie kodów QR offline', () => {
    test('prepareVaultTickets wyciąga pliki z Sejfu i generuje dla nich kody QR (base64 data URL)', async () => {
      const lodging = JSON.parse(sampleTrip.lodging_data);
      const transport = JSON.parse(sampleTrip.transport_data);

      const tickets = await prepareVaultTickets(lodging, transport, sampleTrip.id);

      expect(tickets.length).toBe(2);
      expect(tickets[0].name).toBe('Karta_pokladowa_Ryanair.pdf');
      expect(tickets[0].type).toBe('PDF');
      expect(tickets[0].qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      expect(tickets[1].name).toBe('Rezerwacja_Booking_Hotel.jpg');
      expect(tickets[1].type).toBe('IMAGE');
      expect(tickets[1].qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(tickets[1].thumbnailDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    test('prepareVaultTickets dołącza pojedynczy bilet z transportDetails jeśli istnieje', async () => {
      const lodging = { vaultFiles: [] };
      const transport = {
        details: {
          ticketFile: {
            id: 'ticket-single',
            name: 'Bilet_PKP_Intercity.pdf',
            type: 'PDF',
            uri: 'file://mock_app_dir/pkp.pdf',
          },
        },
      };

      const tickets = await prepareVaultTickets(lodging, transport, 'trip-train');
      expect(tickets.length).toBe(1);
      expect(tickets[0].name).toBe('Bilet_PKP_Intercity.pdf');
      expect(tickets[0].qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('extractQrFromImageBuffer wykrywa kod QR z bufora PNG', async () => {
      const qrPngBuf = await QRCode.toBuffer('https://ryanair.com/boarding/XYZ789', { width: 300, margin: 2 });
      const decoded = extractQrFromImageBuffer(qrPngBuf, true);
      expect(decoded).toBe('https://ryanair.com/boarding/XYZ789');
    });

    test('extractQrFromPdfBuffer wykrywa osadzony kod QR wewnątrz pliku PDF', async () => {
      const qrPngBuf = await QRCode.toBuffer('PKP-INTERCITY-PASS-443322', { width: 300, margin: 2 });
      const img = (UPNG as any).decode(qrPngBuf);
      const rgba = Buffer.from((UPNG as any).toRGBA8(img)[0]);
      const jpegBuf = (jpeg as any).encode({ data: rgba, width: img.width, height: img.height }, 100).data;
      const mockPdfBuf = Buffer.concat([
        Buffer.from('%PDF-1.4\nstream\n'),
        jpegBuf,
        Buffer.from('\nendstream\n%%EOF')
      ]);

      const decoded = extractQrFromPdfBuffer(mockPdfBuf);
      expect(decoded).toBe('PKP-INTERCITY-PASS-443322');
    });

    test('detectAndCropQrFromImage wycina kwadratowy wycinek z kodem QR do base64 PNG', async () => {
      const qrPngBuf = await QRCode.toBuffer('HTTPS://DESTIVO.APP/PASS/SAMPLE123', { width: 320, margin: 2 });
      const res = detectAndCropQrFromImage(qrPngBuf, true);

      expect(res.qrData).toBe('HTTPS://DESTIVO.APP/PASS/SAMPLE123');
      expect(res.croppedQrDataUrl).toMatch(/^data:image\/png;base64,/);

      // Weryfikacja, że wycięty obraz jest poprawnym kwadratem
      const b64 = res.croppedQrDataUrl!.replace(/^data:image\/png;base64,/, '');
      const decodedImg = (UPNG as any).decode(Buffer.from(b64, 'base64'));
      expect(decodedImg.width).toBeGreaterThan(50);
      expect(decodedImg.width).toBe(decodedImg.height); // Idealny kwadrat!
    });

    test('detectAndCropQrFromPdf wycina osadzony kod z pliku PDF jako kwadrat', async () => {
      const qrPngBuf = await QRCode.toBuffer('BOARDING-PASS-SEAT-12B', { width: 300, margin: 2 });
      const img = (UPNG as any).decode(qrPngBuf);
      const rgba = Buffer.from((UPNG as any).toRGBA8(img)[0]);
      const jpegBuf = (jpeg as any).encode({ data: rgba, width: img.width, height: img.height }, 100).data;
      const mockPdfBuf = Buffer.concat([
        Buffer.from('%PDF-1.4\nstream\n'),
        jpegBuf,
        Buffer.from('\nendstream\n%%EOF')
      ]);

      const res = detectAndCropQrFromPdf(mockPdfBuf);
      expect(res.qrData).toBe('BOARDING-PASS-SEAT-12B');
      expect(res.croppedQrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('cropSquareFromRgba poprawnie przycina współrzędne i zwraca kwadrat', () => {
      const W = 200, H = 200;
      const dummy = new Uint8Array(W * H * 4).fill(255);
      const cropped = cropSquareFromRgba(dummy, W, H, 50, 150, 60, 160);
      expect(cropped).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('3. Plan dzień po dniu (Itinerary)', () => {
    test('prepareDayByDayPlan grupuje wydarzenia z customTimeline chronologicznie według dat', () => {
      const attractions = JSON.parse(sampleTrip.attractions_data);
      const transport = JSON.parse(sampleTrip.transport_data);
      const lodging = JSON.parse(sampleTrip.lodging_data);

      const days = prepareDayByDayPlan(sampleTrip, attractions, transport, lodging);

      expect(days.length).toBe(3); // 10.10, 11.10, 12.10
      expect(days[0].dateStr).toBe('10.10.2026');
      expect(days[0].events.length).toBe(2);
      expect(days[0].events[0].time).toBe('07:15');
      expect(days[0].events[1].time).toBe('12:00');
    });

    test('prepareDayByDayPlan tworzy plan awaryjny gdy brak customTimeline', () => {
      const emptyAttractions = { selected: ['Panteon', 'Fontanna di Trevi'] };
      const transport = JSON.parse(sampleTrip.transport_data);
      const lodging = JSON.parse(sampleTrip.lodging_data);

      const days = prepareDayByDayPlan(sampleTrip, emptyAttractions, transport, lodging);

      expect(days.length).toBeGreaterThan(0);
      const allEvents = days.flatMap(d => d.events);
      expect(allEvents.some(e => e.type === 'DEPARTURE')).toBe(true);
      expect(allEvents.some(e => e.type === 'LODGING')).toBe(true);
      expect(allEvents.some(e => e.title === 'Panteon')).toBe(true);
      expect(allEvents.some(e => e.title === 'Fontanna di Trevi')).toBe(true);
      expect(allEvents.some(e => e.type === 'RETURN')).toBe(true);
    });
  });

  describe('4. Generowanie czystego HTML i dokumentu PDF (expo-print)', () => {
    test('generateBriefingHtml generuje kompletny HTML ze wszystkimi danymi podróży', async () => {
      const html = await generateBriefingHtml(sampleTrip, { language: 'pl' });

      // Sprawdzamy kluczowe sekcje
      expect(html).toContain('DESTIVO • OFFLINE TRAVEL BRIEFING');
      expect(html).toContain('Rzymska Przygoda 2026');
      expect(html).toContain('Warszawa ➔ Rzym');
      expect(html).toContain('10.10.2026 – 15.10.2026');
      
      // Numery alarmowe (Rzym -> 112)
      expect(html).toContain('112');
      expect(html).toContain('Numery Alarmowe');
      expect(html).toContain('+48 22 523 8888');

      // Hotel i adres
      expect(html).toContain('Via del Corso 180');

      // Godziny lotów
      expect(html).toContain('07:15 ➔ 09:40');
      expect(html).toContain('Warszawa Chopin (WAW)');
      expect(html).toContain('Rzym Fiumicino (FCO)');

      // W dokumencie nie ma już uciążliwych sekcji plików ani rozciągniętych screenów (są drukowane osobno w Sejfie)
      expect(html).not.toContain('tickets-grid');
      expect(html).not.toContain('ticket-attachment-card');
      expect(html).not.toContain('Bilety i Dokumenty z Sejfu');

      // Plan dzień po dniu
      expect(html).toContain('Koloseum i Forum Romanum');
      expect(html).toContain('Watykan i Bazylika św. Piotra');

      // Zastrzeżenie o 100% offline
      expect(html).toContain('Dokument wygenerowany w 100% offline przez aplikację Destivo');
    });

    test('generateBriefingHtml generuje kompletny HTML w języku angielskim ze słownika translations', async () => {
      const html = await generateBriefingHtml(sampleTrip, { language: 'en' });

      // Sprawdzamy sekcje po angielsku
      expect(html).toContain('DESTIVO • OFFLINE TRAVEL BRIEFING');
      expect(html).toContain('Emergency Survival Document');
      expect(html).toContain('Emergency Numbers');
      expect(html).toContain('Police • Ambulance • Fire');
      expect(html).toContain('Operates without SIM or roaming.');
      expect(html).toContain('Lodging & Address');
      expect(html).toContain('Currency & Safety');
      expect(html).toContain('Transport & Flight / Train Schedule');
      expect(html).toContain('Outbound Journey');
      expect(html).toContain('Return Journey');
      expect(html).not.toContain('tickets-grid');
      expect(html).not.toContain('ticket-attachment-card');
      expect(html).toContain('Day-by-Day Itinerary');
      expect(html).toContain('100% Client-Side Offline Document');
      expect(html).toContain('Generated:');
    });

    test('generateOfflineTravelBriefingPdf wywołuje Print.printToFileAsync i zwraca uri', async () => {
      const result = await generateOfflineTravelBriefingPdf(sampleTrip, { language: 'pl' });

      expect(Print.printToFileAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('DESTIVO • OFFLINE TRAVEL BRIEFING'),
        })
      );
      expect(result.uri).toBeTruthy();
      expect(result.html).toBeTruthy();
    });

    test('shareTravelBriefingPdf wywołuje Sharing.shareAsync z plikiem PDF', async () => {
      const success = await shareTravelBriefingPdf('file:///path/briefing.pdf', 'Rzymska Przygoda');

      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file:///path/briefing.pdf',
        expect.objectContaining({
          mimeType: 'application/pdf',
          dialogTitle: expect.stringContaining('Rzymska Przygoda'),
        })
      );
      expect(success).toBe(true);
    });

    test('printTravelBriefingDirectly wywołuje Print.printAsync', async () => {
      await printTravelBriefingDirectly('<html><body>Test Print</body></html>');

      expect(Print.printAsync).toHaveBeenCalledWith({
        html: '<html><body>Test Print</body></html>',
      });
    });

    test('saveBriefingToVaultStorage kopiuje plik PDF do katalogu Sejfu destivo_vault', async () => {
      const savedDoc = await saveBriefingToVaultStorage(
        'file:///temp/briefing.pdf',
        sampleTrip.id,
        sampleTrip.trip_name
      );

      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'file:///temp/briefing.pdf',
        to: expect.stringContaining('file://mock_app_dir/destivo_vault/'),
      });
      expect(savedDoc).toBeTruthy();
      expect(savedDoc.type).toBe('PDF');
      expect(savedDoc.name).toContain('Briefing_Rzymska_Przygoda_2026');
    });

    test('printVaultFile wywołuje Print.printAsync z URI dla pliku PDF', async () => {
      const pdfFile = {
        id: 'pdf-1',
        name: 'bilet.pdf',
        type: 'PDF',
        uri: 'file://mock_app_dir/destivo_vault/bilet.pdf',
      };

      await printVaultFile(pdfFile);

      expect(Print.printAsync).toHaveBeenCalledWith({
        uri: 'file://mock_app_dir/destivo_vault/bilet.pdf',
      });
    });

    test('printVaultFile wywołuje Print.printAsync z szablonem HTML dla obrazu', async () => {
      const imgFile = {
        id: 'img-1',
        name: 'karta_pokladowa.png',
        type: 'IMAGE',
        uri: 'file://mock_app_dir/destivo_vault/karta.png',
      };

      await printVaultFile(imgFile);

      expect(Print.printAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('DESTIVO VAULT • WYDRUK PLIKU'),
        })
      );
    });
  });
});
