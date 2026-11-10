import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Bezpieczne przechowywanie PIN-u Sejfu:
 * - PIN nigdy nie jest zapisywany jawnym tekstem. Przechowujemy wyłącznie skrót SHA-256(sól + PIN)
 *   z losową 16-bajtową solą, w SecureStore (Android Keystore / iOS Keychain).
 * - W AsyncStorage zostaje tylko informacja, CZY PIN jest ustawiony, oraz licznik nieudanych prób.
 * - Po MAX_ATTEMPTS błędnych próbach sejf jest blokowany czasowo (z wydłużaniem blokady).
 *
 * Uwaga: 4-cyfrowy PIN ma tylko 10 000 kombinacji, więc sam skrót nie chroni przed atakiem
 * słownikowym - właściwą ochronę zapewnia szyfrowanie sprzętowe SecureStore i limit prób.
 */
export const PIN_RECORD_KEY = 'destivo_vault_pin_v1';
export const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

export type PinVerificationResult = 'ok' | 'wrong' | 'locked';

interface PinRecord {
  salt: string;
  hash: string;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const hashPin = (pin: string, salt: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

/** Porównanie w stałym czasie (nie zdradza, na której pozycji skróty się różnią). */
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const savePinRecord = async (pin: string) => {
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const record: PinRecord = { salt, hash: await hashPin(pin, salt) };
  await SecureStore.setItemAsync(PIN_RECORD_KEY, JSON.stringify(record));
};

const readPinRecord = async (): Promise<PinRecord | null> => {
  const raw = await SecureStore.getItemAsync(PIN_RECORD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.salt && parsed?.hash ? parsed : null;
  } catch {
    return null;
  }
};

const lockoutDuration = (failedAttempts: number) =>
  Math.min(BASE_LOCKOUT_MS * 2 ** (failedAttempts - MAX_ATTEMPTS), MAX_LOCKOUT_MS);

export interface VaultState {
  hasPin: boolean;
  isBiometricsEnabled: boolean;
  isUnlocked: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<PinVerificationResult>;
  resetPin: () => Promise<void>;
  getLockoutRemainingMs: () => number;
  setBiometrics: (enabled: boolean) => void;
  unlockVault: () => void;
  lockVault: () => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      hasPin: false,
      isBiometricsEnabled: false,
      isUnlocked: false, // Zawsze zablokowany przy starcie aplikacji
      failedAttempts: 0,
      lockedUntil: null,

      setPin: async (pin) => {
        await savePinRecord(pin);
        set({ hasPin: true, isUnlocked: true, failedAttempts: 0, lockedUntil: null });
      },

      verifyPin: async (pin) => {
        if (get().getLockoutRemainingMs() > 0) return 'locked';

        const record = await readPinRecord();
        if (!record) {
          // Brak skrótu w SecureStore (np. po przywróceniu kopii zapasowej) - wymuszamy ustawienie nowego PIN-u
          set({ hasPin: false, isUnlocked: false });
          return 'wrong';
        }

        if (safeEqual(await hashPin(pin, record.salt), record.hash)) {
          set({ isUnlocked: true, failedAttempts: 0, lockedUntil: null });
          return 'ok';
        }

        const failedAttempts = get().failedAttempts + 1;
        const lockedUntil =
          failedAttempts >= MAX_ATTEMPTS ? Date.now() + lockoutDuration(failedAttempts) : null;
        set({ failedAttempts, lockedUntil });
        return lockedUntil ? 'locked' : 'wrong';
      },

      resetPin: async () => {
        await SecureStore.deleteItemAsync(PIN_RECORD_KEY);
        set({ hasPin: false, isUnlocked: false, failedAttempts: 0, lockedUntil: null });
      },

      getLockoutRemainingMs: () => {
        const { lockedUntil } = get();
        return lockedUntil ? Math.max(0, lockedUntil - Date.now()) : 0;
      },

      setBiometrics: (enabled) => set({ isBiometricsEnabled: enabled }),
      unlockVault: () => set({ isUnlocked: true, failedAttempts: 0, lockedUntil: null }),
      lockVault: () => set({ isUnlocked: false }),
    }),
    {
      name: 'destivo-vault-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // isUnlocked NIE jest zapisywane, dzięki czemu restart aplikacji zamyka sejf.
      partialize: (state) => ({
        hasPin: state.hasPin,
        isBiometricsEnabled: state.isBiometricsEnabled,
        failedAttempts: state.failedAttempts,
        lockedUntil: state.lockedUntil,
      }),
      // Migracja z wersji 0, w której PIN był zapisany jawnym tekstem w AsyncStorage
      migrate: async (persisted: any, version) => {
        if (version < 1 && persisted) {
          const { pin, ...rest } = persisted;
          if (typeof pin === 'string' && pin.length > 0) {
            await savePinRecord(pin);
          }
          return { ...rest, hasPin: typeof pin === 'string' && pin.length > 0 };
        }
        return persisted;
      },
    }
  )
);
