import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import { gcm } from '@noble/ciphers/aes';

const KEY_STORAGE_NAME = 'destivo_vault_aes256_key_v1';
const ENCRYPTION_VERSION = 1;
const FILE_MAGIC = new Uint8Array([0x44, 0x53, 0x54, 0x56, 0x4c, 0x54, 0x30, 0x31]);
const NONCE_LENGTH = 12;

export interface VaultFileReference {
  id: string;
  name: string;
  uri: string;
  type: string;
  createdAt: string;
  encryptionVersion?: number;
}

let keyInitializationPromise: Promise<void> | null = null;

const getDirectoryUri = (directory: string | null, label: string): string => {
  if (!directory) {
    throw new Error(`Vault ${label} directory is unavailable.`);
  }
  return directory.endsWith('/') ? directory : `${directory}/`;
};

const getVaultDirectory = async (): Promise<string> => {
  const directory = `${getDirectoryUri(FileSystem.documentDirectory, 'document')}destivo_vault/`;
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  return directory;
};

const getEncryptionKey = async (): Promise<Uint8Array> => {
  if (!keyInitializationPromise) {
    keyInitializationPromise = (async () => {
      let storedKey = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (!storedKey) {
        const generatedKey = await Crypto.getRandomBytesAsync(32);
        storedKey = Buffer.from(generatedKey).toString('hex');
        await SecureStore.setItemAsync(KEY_STORAGE_NAME, storedKey);
      }

      if (!/^[0-9a-f]{64}$/i.test(storedKey)) {
        throw new Error('Vault encryption key is missing or invalid.');
      }
    })().catch((error) => {
      keyInitializationPromise = null;
      throw error;
    });
  }

  await keyInitializationPromise;
  const storedKey = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
  if (!storedKey || !/^[0-9a-f]{64}$/i.test(storedKey)) {
    throw new Error('Vault encryption key is missing or invalid.');
  }
  return new Uint8Array(Buffer.from(storedKey, 'hex'));
};

const encryptBytes = async (plaintext: Uint8Array): Promise<Uint8Array> => {
  const key = await getEncryptionKey();
  try {
    const nonce = await Crypto.getRandomBytesAsync(NONCE_LENGTH);
    const ciphertext = gcm(key, nonce, FILE_MAGIC).encrypt(plaintext);
    const envelope = new Uint8Array(FILE_MAGIC.length + nonce.length + ciphertext.length);
    envelope.set(FILE_MAGIC);
    envelope.set(nonce, FILE_MAGIC.length);
    envelope.set(ciphertext, FILE_MAGIC.length + nonce.length);
    return envelope;
  } finally {
    key.fill(0);
  }
};

const decryptBytes = async (encrypted: Uint8Array): Promise<Uint8Array> => {
  const minimumLength = FILE_MAGIC.length + NONCE_LENGTH + 16;
  if (encrypted.length < minimumLength || !FILE_MAGIC.every((byte, index) => encrypted[index] === byte)) {
    throw new Error('Vault file is not a supported encrypted file.');
  }

  const nonceStart = FILE_MAGIC.length;
  const ciphertextStart = nonceStart + NONCE_LENGTH;
  const nonce = encrypted.slice(nonceStart, ciphertextStart);
  const ciphertext = encrypted.slice(ciphertextStart);
  const key = await getEncryptionKey();
  try {
    return gcm(key, nonce, FILE_MAGIC).decrypt(ciphertext);
  } catch {
    throw new Error('Vault file could not be decrypted. Its key may be unavailable or the file may be damaged.');
  } finally {
    key.fill(0);
  }
};

const readBase64 = async (uri: string): Promise<string> =>
  FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

const writeEncryptedFile = async (plaintext: Uint8Array): Promise<string> => {
  try {
    const encrypted = await encryptBytes(plaintext);
    const directory = await getVaultDirectory();
    const uri = `${directory}${Crypto.randomUUID()}.vault`;
    await FileSystem.writeAsStringAsync(
      uri,
      Buffer.from(encrypted).toString('base64'),
      { encoding: 'base64' }
    );
    return uri;
  } finally {
    plaintext.fill(0);
  }
};

const getFileExtension = (name: string): string => {
  const extension = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || 'bin';
};

export const VaultManager = {
  async pickFile(): Promise<VaultFileReference | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    return this.saveToVault(asset.uri, asset.name);
  },

  async pickImage(): Promise<VaultFileReference | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    const filename = `Skan_${new Date().toISOString().split('T')[0]}.jpg`;
    return this.saveToVault(asset.uri, filename);
  },

  async saveToVault(tempUri: string, fileName: string): Promise<VaultFileReference> {
    const sourceBase64 = await readBase64(tempUri);
    const permanentUri = await writeEncryptedFile(new Uint8Array(Buffer.from(sourceBase64, 'base64')));
    return {
      id: Crypto.randomUUID(),
      name: fileName,
      uri: permanentUri,
      type: getFileExtension(fileName) === 'pdf' ? 'PDF' : 'IMAGE',
      createdAt: new Date().toISOString(),
      encryptionVersion: ENCRYPTION_VERSION,
    };
  },

  async migrateLegacyFile(file: VaultFileReference): Promise<VaultFileReference> {
    if (file.encryptionVersion === ENCRYPTION_VERSION) return file;
    const sourceBase64 = await readBase64(file.uri);
    const encryptedUri = await writeEncryptedFile(new Uint8Array(Buffer.from(sourceBase64, 'base64')));
    return {
      ...file,
      uri: encryptedUri,
      encryptionVersion: ENCRYPTION_VERSION,
    };
  },

  async createDecryptedTemporaryCopy(
    file: VaultFileReference
  ): Promise<{ uri: string; isTemporary: boolean }> {
    if (file.encryptionVersion !== ENCRYPTION_VERSION) {
      return { uri: file.uri, isTemporary: false };
    }

    const encryptedBase64 = await readBase64(file.uri);
    const plaintext = await decryptBytes(new Uint8Array(Buffer.from(encryptedBase64, 'base64')));
    const cacheDirectory = getDirectoryUri(FileSystem.cacheDirectory, 'cache');
    const uri = `${cacheDirectory}destivo-vault-${Crypto.randomUUID()}.${getFileExtension(file.name)}`;
    await FileSystem.writeAsStringAsync(
      uri,
      Buffer.from(plaintext).toString('base64'),
      { encoding: 'base64' }
    );
    plaintext.fill(0);
    return { uri, isTemporary: true };
  },

  async readFileAsBase64(file: VaultFileReference): Promise<string> {
    if (file.encryptionVersion !== ENCRYPTION_VERSION) {
      return readBase64(file.uri);
    }
    const encryptedBase64 = await readBase64(file.uri);
    const plaintext = await decryptBytes(new Uint8Array(Buffer.from(encryptedBase64, 'base64')));
    const base64 = Buffer.from(plaintext).toString('base64');
    plaintext.fill(0);
    return base64;
  },

  async deleteFile(uri: string): Promise<void> {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },

  async cleanupTemporaryFiles(): Promise<void> {
    const cacheDirectory = getDirectoryUri(FileSystem.cacheDirectory, 'cache');
    const names = await FileSystem.readDirectoryAsync(cacheDirectory);
    await Promise.all(
      names
        .filter((name) => name.startsWith('destivo-vault-'))
        .map((name) => FileSystem.deleteAsync(`${cacheDirectory}${name}`, { idempotent: true }))
    );
  },
};
