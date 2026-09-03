import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface VaultState {
  pin: string | null;
  isBiometricsEnabled: boolean;
  isUnlocked: boolean;
  setPin: (pin: string) => void;
  verifyPin: (pin: string) => boolean;
  setBiometrics: (enabled: boolean) => void;
  unlockVault: () => void;
  lockVault: () => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      pin: null,
      isBiometricsEnabled: false,
      isUnlocked: false, // Zawsze zablokowany przy starcie aplikacji
      
      setPin: (pin) => set({ pin, isUnlocked: true }),
      
      verifyPin: (pin) => {
        const isValid = get().pin === pin;
        if (isValid) set({ isUnlocked: true });
        return isValid;
      },
      
      setBiometrics: (enabled) => set({ isBiometricsEnabled: enabled }),
      unlockVault: () => set({ isUnlocked: true }),
      lockVault: () => set({ isUnlocked: false }),
    }),
    {
      name: 'destivo-vault-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Zapisujemy w pamięci tylko PIN i ustawienia biometrii. 
      // isUnlocked NIE JEST zapisywane, dzięki czemu restart apki zamyka sejf.
      partialize: (state) => ({ 
        pin: state.pin, 
        isBiometricsEnabled: state.isBiometricsEnabled 
      }),
    }
  )
);