/**
 * Hardware Manager
 * 
 * Unified interface for managing all POS hardware devices:
 * - Thermal Printer
 * - Barcode Scanner
 * - Cash Drawer
 */

import {
  ThermalPrinter,
  createThermalPrinter,
  type PrinterConfig,
  type PrinterStatus,
} from './thermal-printer';
import {
  BarcodeScanner,
  createBarcodeScanner,
  type ScannerConfig,
  type ScannerStatus,
  type ScanResult,
} from './barcode-scanner';
import {
  CashDrawer,
  createCashDrawer,
  type CashDrawerStatus,
} from './cash-drawer';
import type { ReceiptConfig, ReceiptData } from '@shared/lib/hardware/receipt-formatter';

// Hardware manager status
export interface HardwareStatus {
  printer: PrinterStatus;
  scanner: ScannerStatus;
  cashDrawer: CashDrawerStatus;
  isReady: boolean;
}

// Hardware configuration
export interface HardwareConfig {
  printer?: PrinterConfig;
  scanner?: ScannerConfig;
  receipt?: Partial<ReceiptConfig>;
  autoConnect?: boolean;
}

// Callback types
type PrinterConnectCallback = (status: PrinterStatus) => void;
type ScannerConnectCallback = (status: ScannerStatus) => void;
type ScanCallback = (result: ScanResult) => void;

/**
 * Hardware Manager class
 */
export class HardwareManager {
  private printer: ThermalPrinter;
  private scanner: BarcodeScanner;
  private cashDrawer: CashDrawer;
  private config: HardwareConfig;

  private printerCallbacks: PrinterConnectCallback[] = [];
  private scannerCallbacks: ScannerConnectCallback[] = [];
  private scanCallbacks: ScanCallback[] = [];

  constructor(config: HardwareConfig = {}) {
    this.config = config;

    // Initialize devices
    this.printer = createThermalPrinter(config.printer, config.receipt);
    this.scanner = createBarcodeScanner(config.scanner);
    this.cashDrawer = createCashDrawer(this.printer);

    // Set up scan handler
    this.scanner.onScan((result) => {
      this.scanCallbacks.forEach((cb) => cb(result));
    });
  }

  /**
   * Get overall hardware status
   */
  getStatus(): HardwareStatus {
    const printerStatus = this.printer.getStatus();
    const scannerStatus = this.scanner.getStatus();
    const drawerStatus = this.cashDrawer.getStatus();

    return {
      printer: printerStatus,
      scanner: scannerStatus,
      cashDrawer: drawerStatus,
      isReady: printerStatus.connected || scannerStatus.connected,
    };
  }

  // ============================================================================
  // Printer Methods
  // ============================================================================

  /**
   * Connect to thermal printer
   */
  async connectPrinter(): Promise<boolean> {
    try {
      const result = await this.printer.connect();
      this.notifyPrinterStatus();
      return result;
    } catch (error) {
      console.error('Printer connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect printer
   */
  async disconnectPrinter(): Promise<void> {
    await this.printer.disconnect();
    this.notifyPrinterStatus();
  }

  /**
   * Print receipt
   */
  async printReceipt(data: ReceiptData): Promise<void> {
    await this.printer.printReceipt(data);
  }

  /**
   * Print text
   */
  async printText(text: string): Promise<void> {
    await this.printer.printText(text);
  }

  /**
   * Print test page
   */
  async printTestPage(): Promise<void> {
    await this.printer.printTestPage();
  }

  /**
   * Register printer status callback
   */
  onPrinterConnect(callback: PrinterConnectCallback): () => void {
    this.printerCallbacks.push(callback);
    return () => {
      this.printerCallbacks = this.printerCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyPrinterStatus(): void {
    const status = this.printer.getStatus();
    this.printerCallbacks.forEach((cb) => cb(status));
  }

  // ============================================================================
  // Scanner Methods
  // ============================================================================

  /**
   * Connect to barcode scanner
   */
  async connectScanner(): Promise<boolean> {
    try {
      const result = await this.scanner.connect();
      this.notifyScannerStatus();
      return result;
    } catch (error) {
      console.error('Scanner connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect scanner
   */
  async disconnectScanner(): Promise<void> {
    await this.scanner.disconnect();
    this.notifyScannerStatus();
  }

  /**
   * Enable keyboard scanner mode
   */
  enableKeyboardScanner(): boolean {
    const result = this.scanner.connectKeyboard();
    this.notifyScannerStatus();
    return result;
  }

  /**
   * Register scan callback
   */
  onScan(callback: ScanCallback): () => void {
    this.scanCallbacks.push(callback);
    return () => {
      this.scanCallbacks = this.scanCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register scanner status callback
   */
  onScannerConnect(callback: ScannerConnectCallback): () => void {
    this.scannerCallbacks.push(callback);
    return () => {
      this.scannerCallbacks = this.scannerCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyScannerStatus(): void {
    const status = this.scanner.getStatus();
    this.scannerCallbacks.forEach((cb) => cb(status));
  }

  /**
   * Simulate a barcode scan (for testing)
   */
  simulateScan(barcode: string): void {
    this.scanner.simulateScan(barcode);
  }

  // ============================================================================
  // Cash Drawer Methods
  // ============================================================================

  /**
   * Open cash drawer
   */
  async openCashDrawer(): Promise<boolean> {
    return await this.cashDrawer.open();
  }

  /**
   * Open secondary cash drawer
   */
  async openSecondaryCashDrawer(): Promise<boolean> {
    return await this.cashDrawer.openSecondary();
  }

  /**
   * Get cash drawer status
   */
  getCashDrawerStatus(): CashDrawerStatus {
    return this.cashDrawer.getStatus();
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Connect all available hardware
   */
  async connectAll(): Promise<HardwareStatus> {
    const results: string[] = [];

    // Try to connect printer
    try {
      await this.connectPrinter();
      results.push('Printer connected');
    } catch (error) {
      results.push('Printer: ' + (error instanceof Error ? error.message : 'Failed'));
    }

    // Try to connect scanner (or enable keyboard mode)
    try {
      await this.connectScanner();
      results.push('Scanner connected');
    } catch {
      // Fall back to keyboard mode silently
      this.enableKeyboardScanner();
      results.push('Scanner: keyboard mode');
    }

    console.log('Hardware connection results:', results);
    return this.getStatus();
  }

  /**
   * Disconnect all hardware
   */
  async disconnectAll(): Promise<void> {
    await this.disconnectPrinter();
    await this.disconnectScanner();
  }

  /**
   * Check if any hardware is connected
   */
  isAnyConnected(): boolean {
    const status = this.getStatus();
    return status.printer.connected || status.scanner.connected;
  }

  /**
   * Get the printer instance (for advanced usage)
   */
  getPrinter(): ThermalPrinter {
    return this.printer;
  }

  /**
   * Get the scanner instance (for advanced usage)
   */
  getScanner(): BarcodeScanner {
    return this.scanner;
  }

  /**
   * Get the cash drawer instance (for advanced usage)
   */
  getCashDrawer(): CashDrawer {
    return this.cashDrawer;
  }
}

// Singleton instance
let hardwareManagerInstance: HardwareManager | null = null;

/**
 * Get the hardware manager instance
 */
export function getHardwareManager(config?: HardwareConfig): HardwareManager {
  if (!hardwareManagerInstance) {
    hardwareManagerInstance = new HardwareManager(config);
  }
  return hardwareManagerInstance;
}

/**
 * Create a new hardware manager instance
 */
export function createHardwareManager(config?: HardwareConfig): HardwareManager {
  return new HardwareManager(config);
}

export default HardwareManager;
