import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

export const VaultManager = {
  // 1. Wybieranie plików (PDF/Obrazy)
  async pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    return await this.saveToVault(asset.uri, asset.name);
  },

  // 2. Robienie zdjęcia aparatem / Wybór z galerii
  async pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    const filename = `Skan_${new Date().toISOString().split('T')[0]}.jpg`;
    return await this.saveToVault(asset.uri, filename);
  },

  // 3. Bezpieczny zapis w pamięci lokalnej (Offline-first)
  async saveToVault(tempUri: string, fileName: string) {
    try {
      const vaultDir = `${FileSystem.documentDirectory}destivo_vault/`;
      const dirInfo = await FileSystem.getInfoAsync(vaultDir);
      
      // Tworzymy ukryty folder, jeśli nie istnieje
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
      }

      const extension = fileName.split('.').pop() || 'file';
      const newFileName = `${Crypto.randomUUID()}.${extension}`;
      const permanentUri = `${vaultDir}${newFileName}`;

      // Kopiujemy plik do bezpiecznej lokalizacji
      await FileSystem.copyAsync({
        from: tempUri,
        to: permanentUri,
      });

      return {
        id: Crypto.randomUUID(),
        name: fileName,
        uri: permanentUri,
        type: extension.toLowerCase() === 'pdf' ? 'PDF' : 'IMAGE',
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error("Vault save error:", error);
      return null;
    }
  }
};