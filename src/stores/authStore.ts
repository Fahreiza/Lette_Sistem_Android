import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isAdmin: false,
  setCurrentUser: (user) =>
    set({
      currentUser: user,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'owner',
    }),
  logout: () =>
    set({
      currentUser: null,
      isAuthenticated: false,
      isAdmin: false,
    }),
}));
