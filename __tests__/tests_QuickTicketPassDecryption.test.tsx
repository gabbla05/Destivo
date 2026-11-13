// __tests__/tests_QuickTicketPassDecryption.test.tsx
// P2: "Bilet w zasięgu ręki" musi pokazywać i udostępniać ODSZYFROWANY bilet, a nie plik .vault.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { QuickTicketPassModal, isEncryptedTicket } from '../src/components/QuickTicketPassModal';
import { VaultManager } from '../src/lib/vaultManager';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: any) => children,
  };
});

jest.mock('../src/lib/vaultManager', () => ({
  VaultManager: {
    createDecryptedTemporaryCopy: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  },
}));

const TEMP_URI = 'file:///cache/destivo-vault-123.jpg';

const encryptedImage = {
  id: 'ticket-img',
  name: 'Skan_2026-11-11.jpg',
  uri: 'file:///documents/destivo_vault/abc.vault',
  type: 'IMAGE',
  encryptionVersion: 1,
};

const encryptedPdf = {
  id: 'ticket-pdf',
  name: 'Bilet_PKP.pdf',
  uri: 'file:///documents/destivo_vault/def.vault',
  type: 'PDF',
  encryptionVersion: 1,
};

const mockedVault = VaultManager as jest.Mocked<typeof VaultManager>;

describe('QuickTicketPassModal - odszyfrowanie biletu z Sejfu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedVault.createDecryptedTemporaryCopy.mockResolvedValue({ uri: TEMP_URI, isTemporary: true });
  });

  test('isEncryptedTicket rozpoznaje pliki Sejfu', () => {
    expect(isEncryptedTicket(encryptedImage)).toBe(true);
    expect(isEncryptedTicket({ uri: 'file:///x/legacy.vault' })).toBe(true);
    expect(isEncryptedTicket({ uri: 'file:///x/bilet.jpg' })).toBe(false);
    expect(isEncryptedTicket(null)).toBe(false);
  });

  test('zdjęcie biletu wyświetla odszyfrowaną kopię tymczasową, a nie plik .vault', async () => {
    const { findByTestId } = render(
      <QuickTicketPassModal visible onClose={jest.fn()} ticketFile={encryptedImage} />
    );

    const image = await findByTestId('quick-pass-ticket-image');
    expect(image.props.source).toEqual({ uri: TEMP_URI });
    expect(mockedVault.createDecryptedTemporaryCopy).toHaveBeenCalledWith(
      expect.objectContaining({ uri: encryptedImage.uri, encryptionVersion: 1 })
    );
  });

  test('udostępnianie PDF przekazuje czytelny plik, a nie zaszyfrowany', async () => {
    const { getByTestId, queryByTestId } = render(
      <QuickTicketPassModal visible onClose={jest.fn()} ticketFile={encryptedPdf} />
    );

    await waitFor(() => expect(queryByTestId('quick-pass-decrypting')).toBeNull(), { timeout: 5000 });
    fireEvent.press(getByTestId('quick-pass-share-pdf-btn'));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled(), { timeout: 5000 });
    const sharedUri = (Sharing.shareAsync as jest.Mock).mock.calls[0][0];
    expect(sharedUri).toBe(TEMP_URI);
    expect(sharedUri).not.toContain('.vault');
  });

  test('plik tymczasowy jest usuwany po zamknięciu podglądu', async () => {
    const { findByTestId, rerender } = render(
      <QuickTicketPassModal visible onClose={jest.fn()} ticketFile={encryptedImage} />
    );
    await findByTestId('quick-pass-ticket-image');
    expect(mockedVault.deleteFile).not.toHaveBeenCalled();

    rerender(<QuickTicketPassModal visible={false} onClose={jest.fn()} ticketFile={encryptedImage} />);
    await waitFor(() => expect(mockedVault.deleteFile).toHaveBeenCalledWith(TEMP_URI));
  });

  test('plik tymczasowy jest usuwany po odmontowaniu', async () => {
    const { findByTestId, unmount } = render(
      <QuickTicketPassModal visible onClose={jest.fn()} ticketFile={encryptedImage} />
    );
    await findByTestId('quick-pass-ticket-image');
    unmount();
    await waitFor(() => expect(mockedVault.deleteFile).toHaveBeenCalledWith(TEMP_URI));
  });

  test('błąd odszyfrowania pokazuje komunikat i blokuje udostępnianie', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedVault.createDecryptedTemporaryCopy.mockRejectedValue(new Error('bad key'));

    const { findByTestId, getByTestId } = render(
      <QuickTicketPassModal visible onClose={jest.fn()} ticketFile={encryptedPdf} />
    );

    await findByTestId('quick-pass-read-error');
    fireEvent.press(getByTestId('quick-pass-share-pdf-btn'));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('starszy, niezaszyfrowany bilet działa bez odszyfrowania', async () => {
    const legacy = { id: 'l', name: 'bilet.jpg', uri: 'file:///old/bilet.jpg', type: 'IMAGE' };
    const { findByTestId } = render(<QuickTicketPassModal visible onClose={jest.fn()} ticketFile={legacy} />);

    const image = await findByTestId('quick-pass-ticket-image');
    expect(image.props.source).toEqual({ uri: legacy.uri });
    expect(mockedVault.createDecryptedTemporaryCopy).not.toHaveBeenCalled();
  });
});
