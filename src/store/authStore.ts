import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  isGuest?: boolean;
}

export interface AuthState {
  user: User | null;
  isGuest: boolean;
  setUser: (user: User | null) => void;
  continueAsGuest: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isGuest: false,
  
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