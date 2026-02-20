/**
 * useHardware - React hook for POS hardware management
 * 
 * Provides easy access to thermal printer, barcode scanner, and cash drawer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  HardwareManager,
  getHardwareManager,
  type HardwareConfig,
  type HardwareStatus,
} from '../lib/hardware/hardware-manager';
// @ts-ignore Hardware types defined locally
import type { PrinterStatus } from '../lib/hardware/thermal-printer';
// @ts-ignore Hardware types defined locally  
import type { ScannerStatus, ScanResult } from '../lib/hardware/barcode-scanner';
import type { ReceiptData } from '@shared/lib/hardware/receipt-formatter';

export interface UseHardwareReturn {
  // Status
  status: HardwareStatus;
  isReady: boolean;
  isPrinterConnected: boolean;
  isScannerConnected: boolean;

  // Connection methods
  connectPrinter: () => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  connectScanner: () => Promise<boolean>;
  disconnectScanner: () => Promise<void>;
  connectAll: () => Promise<HardwareStatus>;
  disconnectAll: () => Promise<void>;

  // Printer methods
  printReceipt: (data: ReceiptData) => Promise<void>;
  printText: (text: string) => Promise<void>;
  printTestPage: () => Promise<void>;

  // Cash drawer
  openCashDrawer: () => Promise<boolean>;

  // Scanner
  lastScan: ScanResult | null;
  enableKeyboardScanner: () => boolean;
  simulateScan: (barcode: string) => void;

  // Errors
  error: string | null;
  clearError: () => void;
}

/**
 * React hook for hardware management
 */
export function useHardware(config?: HardwareConfig): UseHardwareReturn {
  const managerRef = useRef<HardwareManager | null>(null);
  const [status, setStatus] = useState<HardwareStatus>({
    printer: { connected: false, connectionType: 'none' },
    scanner: { connected: false, connectionType: 'none' },
    cashDrawer: { printerConnected: false, openCount: 0 },
    isReady: false,
  });
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize hardware manager
  useEffect(() => {
    managerRef.current = getHardwareManager(config);
    setStatus(managerRef.current.getStatus());

    // Register callbacks
    const unsubPrinter = managerRef.current.onPrinterConnect((printerStatus) => {
      setStatus((prev) => ({
        ...prev,
        printer: printerStatus,
        cashDrawer: { ...prev.cashDrawer, printerConnected: printerStatus.connected },
        isReady: printerStatus.connected || prev.scanner.connected,
      }));
    });

    const unsubScanner = managerRef.current.onScannerConnect((scannerStatus) => {
      setStatus((prev) => ({
        ...prev,
        scanner: scannerStatus,
        isReady: prev.printer.connected || scannerStatus.connected,
      }));
    });

    const unsubScan = managerRef.current.onScan((result) => {
      setLastScan(result);
    });

    return () => {
      unsubPrinter();
      unsubScanner();
      unsubScan();
    };
  }, [config]);

  // Connection methods
  const connectPrinter = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false;
    setError(null);
    try {
      return await managerRef.current.connectPrinter();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Printer connection failed');
      return false;
    }
  }, []);

  const disconnectPrinter = useCallback(async (): Promise<void> => {
    if (!managerRef.current) return;
    await managerRef.current.disconnectPrinter();
  }, []);

  const connectScanner = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false;
    setError(null);
    try {
      return await managerRef.current.connectScanner();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scanner connection failed');
      return false;
    }
  }, []);

  const disconnectScanner = useCallback(async (): Promise<void> => {
    if (!managerRef.current) return;
    await managerRef.current.disconnectScanner();
  }, []);

  const connectAll = useCallback(async (): Promise<HardwareStatus> => {
    if (!managerRef.current) return status;
    setError(null);
    try {
      return await managerRef.current.connectAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      return status;
    }
  }, [status]);

  const disconnectAll = useCallback(async (): Promise<void> => {
    if (!managerRef.current) return;
    await managerRef.current.disconnectAll();
  }, []);

  // Printer methods
  const printReceipt = useCallback(async (data: ReceiptData): Promise<void> => {
    if (!managerRef.current) throw new Error('Hardware manager not initialized');
    setError(null);
    try {
      await managerRef.current.printReceipt(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Print failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const printText = useCallback(async (text: string): Promise<void> => {
    if (!managerRef.current) throw new Error('Hardware manager not initialized');
    setError(null);
    try {
      await managerRef.current.printText(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Print failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const printTestPage = useCallback(async (): Promise<void> => {
    if (!managerRef.current) throw new Error('Hardware manager not initialized');
    setError(null);
    try {
      await managerRef.current.printTestPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test print failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Cash drawer
  const openCashDrawer = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false;
    setError(null);
    try {
      return await managerRef.current.openCashDrawer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open cash drawer');
      return false;
    }
  }, []);

  // Scanner
  const enableKeyboardScanner = useCallback((): boolean => {
    if (!managerRef.current) return false;
    return managerRef.current.enableKeyboardScanner();
  }, []);

  const simulateScan = useCallback((barcode: string): void => {
    if (!managerRef.current) return;
    managerRef.current.simulateScan(barcode);
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    status,
    isReady: status.isReady,
    isPrinterConnected: status.printer.connected,
    isScannerConnected: status.scanner.connected,

    connectPrinter,
    disconnectPrinter,
    connectScanner,
    disconnectScanner,
    connectAll,
    disconnectAll,

    printReceipt,
    printText,
    printTestPage,

    openCashDrawer,

    lastScan,
    enableKeyboardScanner,
    simulateScan,

    error,
    clearError,
  };
}

export default useHardware;
