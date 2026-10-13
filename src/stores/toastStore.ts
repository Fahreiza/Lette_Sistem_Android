import { create } from 'zustand';
import { Vibration } from 'react-native';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const duration = toast.duration || (toast.type === 'error' || toast.type === 'warning' ? 4000 : 3200);

    try {
      if (toast.type === 'error' || toast.type === 'warning') {
        Vibration.vibrate([0, 70, 50, 90]);
      } else {
        Vibration.vibrate(40);
      }
    } catch {}

    set((state) => ({
      // Keep at most 1 previous toast so it doesn't pile up
      toasts: [...state.toasts.slice(-1), { ...toast, id }],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Global helper for calling toast outside React components or inside callbacks
export function showToast(toast: Omit<ToastItem, 'id'>) {
  useToastStore.getState().showToast(toast);
}
