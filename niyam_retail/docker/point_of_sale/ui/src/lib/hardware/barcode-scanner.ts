/**
 * Barcode Scanner Service
 * 
 * Supports both WebHID (dedicated barcode events) and keyboard emulation mode.
 * Compatible with Honeywell, Zebra, Symbol, DataLogic, and most USB barcode scanners.
 */

// Scanner connection types
export type ScannerConnectionType = 'webhid' | 'keyboard' | 'none';

// Scan result
export interface ScanResult {
  barcode: string;
  symbology?: string;
  timestamp: Date;
  source: ScannerConnectionType;
}

// Scanner status
export interface ScannerStatus {
  connected: boolean;
  connectionType: ScannerConnectionType;
  deviceName?: string;
  vendorId?: number;
  productId?: number;
}

// Scanner configuration
export interface ScannerConfig {
  vendorId?: number;
  productId?: number;
  keyboardTimeout?: number; // ms to wait before considering input complete
  minBarcodeLength?: number;
  maxBarcodeLength?: number;
  prefixKey?: string; // Key that signals start of barcode (some scanners send this)
  suffixKey?: string; // Key that signals end of barcode (usually Enter)
}

// Known scanner vendor IDs
const KNOWN_VENDORS = {
  HONEYWELL: 0x0c2e,
  ZEBRA: 0x05e0,
  SYMBOL: 0x05e0,
  DATALOGIC: 0x05f9,
  NEWLAND: 0x1eab,
  OPTICON: 0x065a,
};

// HID report descriptor constants
const HID_USAGE_PAGE_BARCODE = 0x8c;

// Callback type
type ScanCallback = (result: ScanResult) => void;

/**
 * Barcode Scanner class
 */
export class BarcodeScanner {
  private hidDevice: HIDDevice | null = null;
  private connectionType: ScannerConnectionType = 'none';
  private config: ScannerConfig;
  private scanCallback: ScanCallback | null = null;
  private keyboardBuffer: string = '';
  private keyboardTimer: number | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(config: ScannerConfig = {}) {
    this.config = {
      keyboardTimeout: 50,
      minBarcodeLength: 4,
      maxBarcodeLength: 100,
      suffixKey: 'Enter',
      ...config,
    };
  }

  /**
   * Check if WebHID is supported
   */
  static isWebHIDSupported(): boolean {
    return 'hid' in navigator;
  }

  /**
   * Get scanner status
   */
  getStatus(): ScannerStatus {
    if (this.connectionType === 'webhid' && this.hidDevice) {
      return {
        connected: true,
        connectionType: 'webhid',
        deviceName: this.hidDevice.productName || 'HID Scanner',
        vendorId: this.hidDevice.vendorId,
        productId: this.hidDevice.productId,
      };
    }

    if (this.connectionType === 'keyboard') {
      return {
        connected: true,
        connectionType: 'keyboard',
        deviceName: 'Keyboard Mode Scanner',
      };
    }

    return {
      connected: false,
      connectionType: 'none',
    };
  }

  /**
   * Connect to scanner via WebHID
   */
  async connectHID(): Promise<boolean> {
    if (!BarcodeScanner.isWebHIDSupported()) {
      throw new Error('WebHID not supported in this browser');
    }

    try {
      const filters: HIDDeviceFilter[] = this.config.vendorId
        ? [{ vendorId: this.config.vendorId, productId: this.config.productId }]
        : [
            { vendorId: KNOWN_VENDORS.HONEYWELL },
            { vendorId: KNOWN_VENDORS.ZEBRA },
            { vendorId: KNOWN_VENDORS.DATALOGIC },
            { vendorId: KNOWN_VENDORS.NEWLAND },
            { vendorId: KNOWN_VENDORS.OPTICON },
          ];

      const devices = await navigator.hid.requestDevice({ filters });

      if (devices.length === 0) {
        throw new Error('No HID scanner selected');
      }

      const device = devices[0];
      await device.open();

      // Listen for input reports
      device.addEventListener('inputreport', this.handleHIDInput.bind(this));

      this.hidDevice = device;
      this.connectionType = 'webhid';

      console.log('HID scanner connected:', device.productName);
      return true;
    } catch (error) {
      console.error('HID connection failed:', error);
      throw error;
    }
  }

  /**
   * Handle HID input report
   */
  private handleHIDInput(event: HIDInputReportEvent): void {
    const data = event.data;
    const bytes = new Uint8Array(data.buffer);

    // Parse barcode from HID data
    // Most scanners send ASCII characters in the report
    let barcode = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte >= 0x20 && byte <= 0x7e) {
        barcode += String.fromCharCode(byte);
      }
    }

    barcode = barcode.trim();

    if (barcode.length >= (this.config.minBarcodeLength || 1)) {
      this.emitScan({
        barcode,
        timestamp: new Date(),
        source: 'webhid',
      });
    }
  }

  /**
   * Connect in keyboard emulation mode
   */
  connectKeyboard(): boolean {
    if (this.connectionType === 'keyboard') {
      return true; // Already connected
    }

    this.keydownHandler = this.handleKeyboardInput.bind(this);
    document.addEventListener('keydown', this.keydownHandler, true);

    this.connectionType = 'keyboard';
    console.log('Keyboard scanner mode enabled');
    return true;
  }

  /**
   * Handle keyboard input for barcode scanning
   */
  private handleKeyboardInput(event: KeyboardEvent): void {
    // Ignore if typing in an input field
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // Clear timer
    if (this.keyboardTimer !== null) {
      clearTimeout(this.keyboardTimer);
    }

    // Check for suffix key (usually Enter)
    if (event.key === this.config.suffixKey) {
      event.preventDefault();
      this.processKeyboardBuffer();
      return;
    }

    // Check for prefix key
    if (this.config.prefixKey && event.key === this.config.prefixKey) {
      event.preventDefault();
      this.keyboardBuffer = '';
      return;
    }

    // Add character to buffer
    if (event.key.length === 1) {
      event.preventDefault();
      this.keyboardBuffer += event.key;

      // Set timer to auto-process if no more input
      this.keyboardTimer = window.setTimeout(() => {
        this.processKeyboardBuffer();
      }, this.config.keyboardTimeout);
    }
  }

  /**
   * Process the keyboard buffer as a barcode
   */
  private processKeyboardBuffer(): void {
    const barcode = this.keyboardBuffer.trim();
    this.keyboardBuffer = '';

    if (this.keyboardTimer !== null) {
      clearTimeout(this.keyboardTimer);
      this.keyboardTimer = null;
    }

    // Validate barcode length
    if (
      barcode.length >= (this.config.minBarcodeLength || 1) &&
      barcode.length <= (this.config.maxBarcodeLength || 100)
    ) {
      this.emitScan({
        barcode,
        timestamp: new Date(),
        source: 'keyboard',
      });
    }
  }

  /**
   * Auto-connect (try HID first, fall back to keyboard)
   */
  async connect(): Promise<boolean> {
    // Try WebHID first
    if (BarcodeScanner.isWebHIDSupported()) {
      try {
        return await this.connectHID();
      } catch {
        console.log('HID connection failed, falling back to keyboard mode');
      }
    }

    // Fall back to keyboard mode
    return this.connectKeyboard();
  }

  /**
   * Disconnect scanner
   */
  async disconnect(): Promise<void> {
    if (this.hidDevice) {
      await this.hidDevice.close();
      this.hidDevice = null;
    }

    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }

    if (this.keyboardTimer !== null) {
      clearTimeout(this.keyboardTimer);
      this.keyboardTimer = null;
    }

    this.connectionType = 'none';
    this.keyboardBuffer = '';
    console.log('Scanner disconnected');
  }

  /**
   * Register scan callback
   */
  onScan(callback: ScanCallback): () => void {
    this.scanCallback = callback;
    return () => {
      this.scanCallback = null;
    };
  }

  /**
   * Emit scan event
   */
  private emitScan(result: ScanResult): void {
    console.log('Barcode scanned:', result.barcode);
    if (this.scanCallback) {
      this.scanCallback(result);
    }
  }

  /**
   * Simulate a scan (for testing)
   */
  simulateScan(barcode: string): void {
    this.emitScan({
      barcode,
      timestamp: new Date(),
      source: this.connectionType,
    });
  }
}

// Singleton instance
let scannerInstance: BarcodeScanner | null = null;

/**
 * Get the barcode scanner instance
 */
export function getBarcodeScanner(config?: ScannerConfig): BarcodeScanner {
  if (!scannerInstance) {
    scannerInstance = new BarcodeScanner(config);
  }
  return scannerInstance;
}

/**
 * Create a new barcode scanner instance
 */
export function createBarcodeScanner(config?: ScannerConfig): BarcodeScanner {
  return new BarcodeScanner(config);
}

export default BarcodeScanner;
