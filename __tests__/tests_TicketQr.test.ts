/// <reference types="jest" />
// P11: kod QR pokazujemy tylko wtedy, gdy został faktycznie odczytany z biletu.
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: any[]) => mockManipulate(...args),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

const mockDetectImage = jest.fn();
const mockDetectPdf = jest.fn();
jest.mock('../src/lib/offlineTravelBriefing', () => ({
  detectAndCropQrFromImage: (...args: any[]) => mockDetectImage(...args),
  detectAndCropQrFromPdf: (...args: any[]) => mockDetectPdf(...args),
}));

jest.mock('../src/lib/vaultManager', () => ({
  VaultManager: {
    readFileAsBase64: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4').toString('base64')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    createDecryptedTemporaryCopy: jest.fn().mockResolvedValue({ uri: 'file:///cache/dec-copy.pdf', isTemporary: true }),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue(Buffer.from('jpeg-page').toString('base64')),
}));

import { detectTicketQr, __resetTicketQrCacheForTests } from '../src/lib/ticketQr';
import { VaultManager } from '../src/lib/vaultManager';
import PdfThumbnail from 'react-native-pdf-thumbnail';

describe('detectTicketQr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetTicketQrCacheForTests();
    mockManipulate.mockResolvedValue({ uri: 'file:///cache/resized.jpg', base64: Buffer.from('jpg').toString('base64') });
  });

  test('zdjęcie biletu: odczytany kod jest generowany na nowo, a pomniejszona kopia usuwana', async () => {
    mockDetectImage.mockReturnValue({ qrData: 'PKP-TICKET-123', croppedQrDataUrl: null, source: 'decoded' });
    const res = await detectTicketQr({ uri: 'file:///vault/a.vault', name: 'Skan.jpg', type: 'IMAGE' }, 'file:///cache/dec.jpg');

    expect(res.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(mockManipulate).toHaveBeenCalledWith('file:///cache/dec.jpg', [{ resize: { width: 1200 } }], expect.objectContaining({ base64: true }));
    expect(VaultManager.deleteFile).toHaveBeenCalledWith('file:///cache/resized.jpg');
  });

  test('link z tekstu PDF nie jest traktowany jak kod z biletu', async () => {
    mockDetectPdf.mockReturnValue({ qrData: 'https://booking.example/checkin', croppedQrDataUrl: null, source: 'text' });
    // wyrenderowana strona też nie zawiera kodu QR
    mockDetectImage.mockReturnValue({ qrData: null, croppedQrDataUrl: null });
    const res = await detectTicketQr({ uri: 'file:///vault/b.vault', name: 'Bilet.pdf', type: 'PDF', encryptionVersion: 1 });
    expect(res.qrDataUrl).toBeNull();
  });

  test('sam wycinek "podobny do kodu" nie wystarcza', async () => {
    mockDetectImage.mockReturnValue({ qrData: null, croppedQrDataUrl: 'data:image/png;base64,CROP', source: 'crop' });
    const res = await detectTicketQr({ uri: 'file:///vault/c.vault', name: 'Skan.jpg', type: 'IMAGE' }, 'file:///cache/dec.jpg');
    expect(res.qrDataUrl).toBeNull();
  });

  test('wynik jest zapamiętany dla pliku', async () => {
    mockDetectImage.mockReturnValue({ qrData: null, croppedQrDataUrl: null });
    await detectTicketQr({ uri: 'file:///vault/d.vault', name: 'Skan.jpg' }, 'file:///cache/dec.jpg');
    await detectTicketQr({ uri: 'file:///vault/d.vault', name: 'Skan.jpg' }, 'file:///cache/dec.jpg');
    expect(mockManipulate).toHaveBeenCalledTimes(1);
  });

  test('PDF z kodem rysowanym wektorowo: strona jest renderowana do obrazu i z niego odczytywany kod', async () => {
    mockDetectPdf.mockReturnValue({ qrData: null, croppedQrDataUrl: null });
    mockDetectImage.mockReturnValue({ qrData: 'FLIX-ORDER-998877', croppedQrDataUrl: null, source: 'decoded' });
    const res = await detectTicketQr(
      { uri: 'file:///vault/e.vault', name: 'Bilet.pdf', type: 'PDF', encryptionVersion: 1 },
      'file:///cache/destivo-vault-1.pdf'
    );
    expect(res.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(PdfThumbnail.generate).toHaveBeenCalledWith('file:///cache/destivo-vault-1.pdf', 0, expect.objectContaining({ maxWidth: 1600 }));
    expect(mockManipulate).not.toHaveBeenCalled();
    // obraz strony (odszyfrowana treść) jest usuwany
    expect(VaultManager.deleteFile).toHaveBeenCalledWith('file:///cache/pdf-page-0.jpg');
  });

  test('PDF bez typu i rozszerzenia w nazwie rozpoznawany po odszyfrowanej kopii .pdf (błąd z telefonu)', async () => {
    mockDetectPdf.mockReturnValue({ qrData: null, croppedQrDataUrl: null });
    mockDetectImage.mockReturnValue({ qrData: 'PKP-KM-555', croppedQrDataUrl: null, source: 'decoded' });
    const res = await detectTicketQr({ uri: 'file:///vault/f.vault', name: 'Bilet tam' }, 'file:///cache/destivo-vault-2.pdf');
    expect(res.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  test('PDF dla briefingu (bez odszyfrowanej kopii): tymczasowa kopia jest tworzona i usuwana', async () => {
    mockDetectPdf.mockReturnValue({ qrData: null, croppedQrDataUrl: null });
    mockDetectImage.mockReturnValue({ qrData: 'BOARDING-1', croppedQrDataUrl: null, source: 'decoded' });
    const res = await detectTicketQr({ uri: 'file:///vault/g.vault', name: 'Karta.pdf', type: 'PDF', encryptionVersion: 1 });
    expect(res.qrDataUrl).not.toBeNull();
    expect(VaultManager.createDecryptedTemporaryCopy).toHaveBeenCalled();
    expect(VaultManager.deleteFile).toHaveBeenCalledWith('file:///cache/dec-copy.pdf');
  });
});
