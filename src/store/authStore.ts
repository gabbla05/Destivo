import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'en' | 'pl';

export interface User {
  id: string;
  email: string;
  isGuest?: boolean;
  name?: string;
  language?: Language;
}

export interface AuthState {
  user: User | null;
  isGuest: boolean;
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (language: Language) => void;
  setUser: (user: User | null) => void;
  continueAsGuest: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isGuest: false,
      language: 'pl',
      toggleLanguage: () => set((state) => ({ language: state.language === 'pl' ? 'en' : 'pl' })),
      setLanguage: (language) => set({ language }),

      setUser: (user) =>
        set((state) => ({
          user,
          isGuest: user?.isGuest ?? false,
          language: user?.language ?? state.language,
        })),

      continueAsGuest: () =>
        set({
          user: { id: 'guest-session', email: 'guest@destivo.io', isGuest: true },
          isGuest: true,
        }),

      logout: () =>
        set({
          user: null,
          isGuest: false,
        }),
    }),
    {
      name: 'destivo-auth-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isGuest: state.isGuest,
        language: state.language,
      }),
    }
  )
);