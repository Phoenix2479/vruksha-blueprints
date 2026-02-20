/**
 * Cash Drawer Service
 * 
 * Opens cash drawer via the thermal printer's kick connector (DK port).
 * Most cash drawers connect to the printer's RJ-11/RJ-12 port.
 */

import { getThermalPrinter, type ThermalPrinter } from './thermal-printer';
import { createBuilder } from '@shared/lib/hardware/escpos-commands';

// Cash drawer status
export interface CashDrawerStatus {
  printerConnected: boolean;
  lastOpenedAt?: Date;
  openCount: number;
}

/**
 * Cash Drawer class
 */
export class CashDrawer {
  private printer: ThermalPrinter | null = null;
  private openCount: number = 0;
  private lastOpenedAt?: Date;

  constructor(printer?: ThermalPrinter) {
    this.printer = printer || null;
  }

  /**
   * Set the printer to use for cash drawer
   */
  setPrinter(printer: ThermalPrinter): void {
    this.printer = printer;
  }

  /**
   * Get cash drawer status
   */
  getStatus(): CashDrawerStatus {
    return {
      printerConnected: this.printer?.getStatus().connected || false,
      lastOpenedAt: this.lastOpenedAt,
      openCount: this.openCount,
    };
  }

  /**
   * Open cash drawer (pin 2 - most common)
   */
  async open(): Promise<boolean> {
    if (!this.printer) {
      // Try to get singleton printer instance
      this.printer = getThermalPrinter();
    }

    const status = this.printer.getStatus();
    if (!status.connected) {
      throw new Error('Printer not connected. Cash drawer requires a connected printer.');
    }

    try {
      await this.printer.openCashDrawer();
      this.lastOpenedAt = new Date();
      this.openCount++;
      console.log('Cash drawer opened');
      return true;
    } catch (error) {
      console.error('Failed to open cash drawer:', error);
      throw error;
    }
  }

  /**
   * Open secondary cash drawer (pin 5)
   * Some setups have two cash drawers connected
   */
  async openSecondary(): Promise<boolean> {
    if (!this.printer) {
      this.printer = getThermalPrinter();
    }

    const status = this.printer.getStatus();
    if (!status.connected) {
      throw new Error('Printer not connected');
    }

    try {
      const builder = createBuilder();
      builder.raw([0x1b, 0x70, 1, 25, 250]); // ESC p 1 t1 t2 (pin 5)
      await this.printer.print(builder);
      
      this.lastOpenedAt = new Date();
      this.openCount++;
      console.log('Secondary cash drawer opened');
      return true;
    } catch (error) {
      console.error('Failed to open secondary cash drawer:', error);
      throw error;
    }
  }

  /**
   * Reset open count
   */
  resetCount(): void {
    this.openCount = 0;
    this.lastOpenedAt = undefined;
  }
}

// Singleton instance
let drawerInstance: CashDrawer | null = null;

/**
 * Get the cash drawer instance
 */
export function getCashDrawer(printer?: ThermalPrinter): CashDrawer {
  if (!drawerInstance) {
    drawerInstance = new CashDrawer(printer);
  } else if (printer) {
    drawerInstance.setPrinter(printer);
  }
  return drawerInstance;
}

/**
 * Create a new cash drawer instance
 */
export function createCashDrawer(printer?: ThermalPrinter): CashDrawer {
  return new CashDrawer(printer);
}

export default CashDrawer;
