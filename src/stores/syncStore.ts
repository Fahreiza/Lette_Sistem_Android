import { create } from 'zustand';
import { settingsService } from '../services/settingsService';

interface SyncState {
  deviceId: string;
  serverUrl: string;
  bridgeToken: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  storeName: string;
  lastSyncTime: string | null;
  pendingOrdersCount: number;
  disconnectMessage: string | null;
  setDeviceId: (id: string) => void;
  setServerUrl: (url: string) => void;
  setBridgeToken: (token: string | null) => void;
  setIsConnected: (connected: boolean) => void;
  setIsConnecting: (connecting: boolean) => void;
  setStoreName: (name: string) => void;
  setLastSyncTime: (time: string) => void;
  setPendingOrdersCount: (count: number) => void;
  setDisconnectMessage: (msg: string | null) => void;
  initFromStorage: () => Promise<string>;
}

const defaultDeviceId = 'hp_' + Math.random().toString(36).substring(2, 8);

export const useSyncStore = create<SyncState>((set, get) => ({
  deviceId: defaultDeviceId,
  serverUrl: '',
  bridgeToken: null,
  isConnected: false,
  isConnecting: false,
  storeName: 'Lette Kasir Desktop',
  lastSyncTime: null,
  pendingOrdersCount: 0,
  disconnectMessage: null,
  setDeviceId: (id) => {
    set({ deviceId: id });
    if (id) {
      settingsService.updateSettings({ device_id: id }).catch((e) => {
        console.warn('[SyncStore] Could not persist device_id:', e);
      });
    }
  },
  setServerUrl: (url) => {
    set({ serverUrl: url });
    if (url) {
      settingsService.updateSettings({ bridge_server_url: url }).catch((e) => {
        console.warn('[SyncStore] Could not persist bridge_server_url:', e);
      });
    }
  },
  setBridgeToken: (token) => set({ bridgeToken: token }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setIsConnecting: (connecting) => set({ isConnecting: connecting }),
  setStoreName: (name) => set({ storeName: name }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setPendingOrdersCount: (count) => set({ pendingOrdersCount: count }),
  setDisconnectMessage: (msg) => set({ disconnectMessage: msg }),
  initFromStorage: async () => {
    try {
      const s = await settingsService.getSettings();
      if (s.device_id) {
        set({ deviceId: s.device_id });
      } else {
        const generated = 'hp_' + Math.random().toString(36).substring(2, 8);
        set({ deviceId: generated });
        await settingsService.updateSettings({ device_id: generated }).catch(() => {});
      }
      if (s.bridge_server_url) {
        set({ serverUrl: s.bridge_server_url });
        return s.bridge_server_url;
      }
    } catch (e) {
      console.warn('[SyncStore] Init from storage failed:', e);
    }
    return '';
  },
}));
