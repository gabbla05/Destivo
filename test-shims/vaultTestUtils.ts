import { useVaultStore, VaultState } from '../src/store/vaultStore';

/**
 * Ustawia stan Sejfu w testach. PIN nie jest już polem stanu - zapisujemy jego skrót
 * przez setPin() (SecureStore), a pozostałe pola ustawiamy bezpośrednio.
 */
export async function setVaultTestState({
  pin,
  ...rest
}: { pin: string | null } & Partial<Pick<VaultState, 'isBiometricsEnabled' | 'isUnlocked'>>) {
  const store = useVaultStore.getState();
  if (pin) {
    await store.setPin(pin);
  } else {
    await store.resetPin();
  }
  useVaultStore.setState({ failedAttempts: 0, lockedUntil: null, isUnlocked: false, ...rest });
}
