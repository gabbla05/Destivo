import { Buffer } from 'buffer';
import { VaultManager } from '../src/lib/vaultManager';

const mockFiles = new Map<string, string>();
const mockSecureEntries = new Map<string, string>();
let mockRandomCounter = 0;
let mockUuidCounter = 0;

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://vault-docs/',
  cacheDirectory: 'file://vault-cache/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const value = mockFiles.get(uri);
    if (value === undefined) throw new Error(`Missing test file: ${uri}`);
    return value;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, value: string) => {
    mockFiles.set(uri, value);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
}));

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureEntries.get(key) || null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureEntries.set(key, value);
  }),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (length: number) => {
    mockRandomCounter += 1;
    return new Uint8Array(length).fill(mockRandomCounter);
  }),
  randomUUID: jest.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

describe('Szyfrowanie plików Sejfu', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  test('zapisuje plik jako AES-GCM ciphertext i odszyfrowuje go do tymczasowego pliku', async () => {
    const plaintext = Buffer.from('Poufny bilet podróżny').toString('base64');
    mockFiles.set('file://source/ticket.pdf', plaintext);

    const file = await VaultManager.saveToVault('file://source/ticket.pdf', 'ticket.pdf');

    expect(file).toMatchObject({ type: 'PDF', encryptionVersion: 1 });
    expect(file?.uri).toMatch(/\.vault$/);
    expect(mockFiles.get(file!.uri)).not.toContain(plaintext);
    expect(mockSecureEntries.get('destivo_vault_aes256_key_v1')).toMatch(/^[0-9a-f]{64}$/);

    const decrypted = await VaultManager.createDecryptedTemporaryCopy(file!);
    expect(decrypted.isTemporary).toBe(true);
    expect(mockFiles.get(decrypted.uri)).toBe(plaintext);
    await VaultManager.deleteFile(decrypted.uri);
    expect(mockFiles.has(decrypted.uri)).toBe(false);
  });

  test('odrzuca plik, którego uwierzytelniony ciphertext został zmieniony', async () => {
    const plaintext = Buffer.from('Dokument').toString('base64');
    mockFiles.set('file://source/document.pdf', plaintext);
    const file = await VaultManager.saveToVault('file://source/document.pdf', 'document.pdf');
    const encrypted = Buffer.from(mockFiles.get(file!.uri)!, 'base64');
    encrypted[encrypted.length - 1] ^= 0xff;
    mockFiles.set(file!.uri, encrypted.toString('base64'));

    await expect(VaultManager.createDecryptedTemporaryCopy(file!)).rejects.toThrow(
      'Vault file could not be decrypted'
    );
  });

  test('migruje dotychczasowy niezaszyfrowany plik do nowego zaszyfrowanego formatu', async () => {
    const plaintext = Buffer.from('Stary bilet PDF').toString('base64');
    const oldUri = 'file://vault-docs/destivo_vault/old.pdf';
    mockFiles.set(oldUri, plaintext);

    const migrated = await VaultManager.migrateLegacyFile({
      id: 'legacy-file',
      name: 'old.pdf',
      uri: oldUri,
      type: 'PDF',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(migrated.encryptionVersion).toBe(1);
    expect(migrated.uri).not.toBe(oldUri);
    expect(mockFiles.get(migrated.uri)).not.toContain(plaintext);
    expect(mockFiles.get(oldUri)).toBe(plaintext);

    const decrypted = await VaultManager.createDecryptedTemporaryCopy(migrated);
    expect(mockFiles.get(decrypted.uri)).toBe(plaintext);
  });
});
