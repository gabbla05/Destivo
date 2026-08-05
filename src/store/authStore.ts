import { create } from 'zustand';

export type Language = 'en' | 'pl';

export interface User {
  id: string;
  email: string;
  isGuest?: boolean;
  name?: string;
}

export interface AuthState {
  user: User | null;
  isGuest: boolean;
  language: Language;
  toggleLanguage: () => void;
  setUser: (user: User | null) => void;
  continueAsGuest: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isGuest: false,
  language: 'pl',
  toggleLanguage: () => set((state) => ({ language: state.language === 'pl' ? 'en' : 'pl' })),
  
  // Ustawia zalogowanego lub zarejestrowanego użytkownika
  setUser: (user) => 
    set({ 
      user, 
      isGuest: user?.isGuest ?? false 
    }),

  // Tryb gościa (bez konta w Supabase)
  continueAsGuest: () => 
    set({ 
      user: { id: 'guest-session', email: 'guest@destivo.io', isGuest: true }, 
      isGuest: true 
    }),

  // Wylogowanie / wyjście z Sejfu
  logout: () => 
    set({ 
      user: null, 
      isGuest: false 
    }),
}));