import { create } from 'zustand';

export interface BluetoothDevice {
  name: string;
  address: string; // MAC Address e.g. 66:32:B1:89:12:44
  bonded?: boolean;
}

interface PrinterState {
  // Fields aligned with POS-Offline-main
  printerTarget: string | null;
  printerName: string | null;
  connected: boolean;
  setPrinter: (target: string, name: string) => void;
  setConnected: (connected: boolean) => void;
  disconnect: () => void;

  // Lette POS specific / UI state
  connectedPrinter: BluetoothDevice | null;
  isScanning: boolean;
  isConnecting: boolean;
  availableDevices: BluetoothDevice[];
  paperWidth: '58mm' | '80mm';
  autoPrintOnSuccess: boolean;

  setConnectedPrinter: (printer: BluetoothDevice | null) => void;
  setIsScanning: (scanning: boolean) => void;
  setIsConnecting: (connecting: boolean) => void;
  setAvailableDevices: (devices: BluetoothDevice[]) => void;
  setPaperWidth: (width: '58mm' | '80mm') => void;
  setAutoPrintOnSuccess: (enabled: boolean) => void;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  printerTarget: null,
  printerName: null,
  connected: false,
  connectedPrinter: null,
  isScanning: false,
  isConnecting: false,
  availableDevices: [],
  paperWidth: '58mm',
  autoPrintOnSuccess: false,

  setPrinter: (target, name) =>
    set({
      printerTarget: target,
      printerName: name,
      connected: true,
      connectedPrinter: { name: name || 'Printer', address: target },
    }),

  setConnected: (connected) =>
    set((state) => ({
      connected,
      connectedPrinter: connected
        ? state.connectedPrinter || (state.printerTarget ? { name: state.printerName || 'Printer', address: state.printerTarget } : null)
        : null,
    })),

  disconnect: () =>
    set({
      printerTarget: null,
      printerName: null,
      connected: false,
      connectedPrinter: null,
    }),

  setConnectedPrinter: (printer) =>
    set({
      connectedPrinter: printer,
      printerTarget: printer?.address || null,
      printerName: printer?.name || null,
      connected: Boolean(printer),
    }),

  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setIsConnecting: (connecting) => set({ isConnecting: connecting }),
  setAvailableDevices: (devices) => set({ availableDevices: devices }),
  setPaperWidth: (width) => set({ paperWidth: width }),
  setAutoPrintOnSuccess: (enabled) => set({ autoPrintOnSuccess: enabled }),
}));
