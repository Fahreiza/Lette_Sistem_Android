import '@vardrz/react-native-bluetooth-escpos-printer';

declare module '@vardrz/react-native-bluetooth-escpos-printer' {
  interface BluetoothEscposPrinterType {
    printerInit(): Promise<void>;
    printerAlign(align: number): Promise<void>;
    printAndFeed(value: number): Promise<void>;
    printColumn(
      widths: number[],
      aligns: number[],
      data: string[],
      options?: Record<string, unknown>
    ): Promise<void>;
    cutOnePoint(): void;
    cutPaper(): Promise<void>;
    openDrawer(pin: number, t1: number, t2: number): Promise<void>;
    printText(text: string, options?: Record<string, unknown>): Promise<void>;
    printPic(base64: string, options?: Record<string, unknown>): Promise<void>;
    ALIGN: {
      LEFT: number;
      CENTER: number;
      RIGHT: number;
    };
  }

  interface BluetoothManagerType {
    enableBluetooth(): Promise<string[] | boolean>;
    isBluetoothEnabled(): Promise<boolean>;
    scanDevices(): Promise<string | { paired: any[]; found: any[] }>;
    connect(address: string): Promise<string | void>;
    disconnect(address: string): Promise<string | void>;
    isDeviceConnected(): Promise<boolean>;
  }
}
