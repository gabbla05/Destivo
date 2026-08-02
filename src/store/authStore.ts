import { create } from 'zustand';

interface AuthState {
  isGuest: boolean;
  continueAsGuest: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isGuest: false,

  // Kliknięcie "Kontynuuj jako gość"
  continueAsGuest: () => {
    console.log('Wejście w trybie gościa');
    set({ isGuest: true });
  },

  // Wyjście z trybu gościa / wylogowanie
  logout: () => set({ isGuest: false }),
}));