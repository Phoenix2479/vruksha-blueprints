/**
 * Thermal Printer Service
 * 
 * Supports WebUSB and Web Serial APIs for direct printer communication.
 * Compatible with Epson, Star, Bixolon, and most ESC/POS thermal printers.
 */

// WebUSB and Web Serial type declarations for browsers that support them
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
    usb?: {
      requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
      getDevices(): Promise<USBDevice[]>;
    };
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array> | null;
    readable: ReadableStream<Uint8Array> | null;
    getInfo(): { usbVendorId?: number; usbProductId?: number };
  }
  interface USBDeviceFilter {
    vendorId?: number;
    productId?: number;
  }
  interface USBDevice {
    vendorId: number;
    productId: number;
    productName?: string;
    configuration?: USBConfiguration;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  }
  interface USBConfiguration {
    configurationValue: number;
    interfaces: USBInterface[];
  }
  interface USBInterface {
    interfaceNumber: number;
    alternate: USBAlternateInterface;
  }
  interface USBAlternateInterface {
    interfaceClass: number;
    endpoints: USBEndpoint[];
  }
  interface USBEndpoint {
    endpointNumber: number;
    direction: 'in' | 'out';
    type: 'bulk' | 'interrupt' | 'isochronous';
  }
  interface USBOutTransferResult {
    bytesWritten: number;
    status: 'ok' | 'stall' | 'babble';
  }
}

import { createBuilder, ESCPOSBuilder } from '@shared/lib/hardware/escpos-commands';
import {
  createReceiptFormatter,
  type ReceiptConfig,
  type ReceiptData,
} from '@shared/lib/hardware/receipt-formatter';

// Printer connection types
export type PrinterConnectionType = 'webusb' | 'webserial' | 'none';

// Printer status
export interface PrinterStatus {
  connected: boolean;
  connectionType: PrinterConnectionType;
  printerName?: string;
  vendorId?: number;
  productId?: number;
  paperStatus?: 'ok' | 'low' | 'out';
  coverOpen?: boolean;
  error?: string;
}

// Printer configuration
export interface PrinterConfig {
  vendorId?: number;
  productId?: number;
  baudRate?: number; // For serial
  paperWidth?: 58 | 80;
}

// Known printer vendor IDs
const KNOWN_VENDORS = {
  EPSON: 0x04b8,
  STAR: 0x0519,
  BIXOLON: 0x1504,
  CITIZEN: 0x1d90,
  CUSTOM: 0x0dd4,
  SEWOO: 0x0fe6,
};

// Default USB filters for thermal printers
const USB_FILTERS: USBDeviceFilter[] = [
  { vendorId: KNOWN_VENDORS.EPSON },
  { vendorId: KNOWN_VENDORS.STAR },
  { vendorId: KNOWN_VENDORS.BIXOLON },
  { vendorId: KNOWN_VENDORS.CITIZEN },
  { vendorId: KNOWN_VENDORS.CUSTOM },
  { vendorId: KNOWN_VENDORS.SEWOO },
  // Generic printer class
  { classCode: 7 }, // Printer class
];

/**
 * Thermal Printer class
 */
export class ThermalPrinter {
  private usbDevice: USBDevice | null = null;
  private serialPort: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter | null = null;
  private connectionType: PrinterConnectionType = 'none';
  private config: PrinterConfig;
  private receiptConfig: Partial<ReceiptConfig>;

  constructor(config: PrinterConfig = {}, receiptConfig: Partial<ReceiptConfig> = {}) {
    this.config = config;
    this.receiptConfig = receiptConfig;
  }

  /**
   * Check if WebUSB is supported
   */
  static isWebUSBSupported(): boolean {
    return 'usb' in navigator;
  }

  /**
   * Check if Web Serial is supported
   */
  static isWebSerialSupported(): boolean {
    return 'serial' in navigator;
  }

  /**
   * Get printer status
   */
  getStatus(): PrinterStatus {
    if (this.connectionType === 'webusb' && this.usbDevice) {
      return {
        connected: true,
        connectionType: 'webusb',
        printerName: this.usbDevice.productName || 'USB Printer',
        vendorId: this.usbDevice.vendorId,
        productId: this.usbDevice.productId,
      };
    }

    if (this.connectionType === 'webserial' && this.serialPort) {
      return {
        connected: true,
        connectionType: 'webserial',
        printerName: 'Serial Printer',
      };
    }

    return {
      connected: false,
      connectionType: 'none',
    };
  }

  /**
   * Connect to printer via WebUSB
   */
  async connectUSB(): Promise<boolean> {
    if (!ThermalPrinter.isWebUSBSupported()) {
      throw new Error('WebUSB not supported in this browser');
    }

    try {
      // Request device
      const device = await navigator.usb.requestDevice({
        filters: this.config.vendorId
          ? [{ vendorId: this.config.vendorId, productId: this.config.productId }]
          : USB_FILTERS,
      });

      await device.open();

      // Select configuration
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Claim interface
      const interfaceNumber = this.findPrinterInterface(device);
      await device.claimInterface(interfaceNumber);

      this.usbDevice = device;
      this.connectionType = 'webusb';

      console.log('USB printer connected:', device.productName);
      return true;
    } catch (error) {
      console.error('USB connection failed:', error);
      throw error;
    }
  }

  /**
   * Find the printer interface number
   */
  private findPrinterInterface(device: USBDevice): number {
    const config = device.configuration;
    if (!config) return 0;

    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        // Look for printer class or bulk endpoints
        if (alt.interfaceClass === 7 || // Printer
            alt.endpoints.some(ep => ep.type === 'bulk' && ep.direction === 'out')) {
          return iface.interfaceNumber;
        }
      }
    }

    return 0;
  }

  /**
   * Find the output endpoint
   */
  private findOutputEndpoint(device: USBDevice): USBEndpoint | undefined {
    const config = device.configuration;
    if (!config) return undefined;

    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        for (const endpoint of alt.endpoints) {
          if (endpoint.type === 'bulk' && endpoint.direction === 'out') {
            return endpoint;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Connect to printer via Web Serial
   */
  async connectSerial(): Promise<boolean> {
    if (!ThermalPrinter.isWebSerialSupported()) {
      throw new Error('Web Serial not supported in this browser');
    }

    try {
      // Request port
      const port = await navigator.serial.requestPort({
        filters: this.config.vendorId
          ? [{ usbVendorId: this.config.vendorId, usbProductId: this.config.productId }]
          : [],
      });

      // Open port
      await port.open({
        baudRate: this.config.baudRate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      this.serialPort = port;
      this.connectionType = 'webserial';
      this.writer = port.writable?.getWriter() || null;

      console.log('Serial printer connected');
      return true;
    } catch (error) {
      console.error('Serial connection failed:', error);
      throw error;
    }
  }

  /**
   * Auto-connect (try USB first, then Serial)
   */
  async connect(): Promise<boolean> {
    // Try USB first
    if (ThermalPrinter.isWebUSBSupported()) {
      try {
        return await this.connectUSB();
      } catch {
        console.log('USB connection failed, trying Serial...');
      }
    }

    // Fall back to Serial
    if (ThermalPrinter.isWebSerialSupported()) {
      return await this.connectSerial();
    }

    throw new Error('No supported printer connection method available');
  }

  /**
   * Disconnect from printer
   */
  async disconnect(): Promise<void> {
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }

    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
    }

    if (this.usbDevice) {
      await this.usbDevice.close();
      this.usbDevice = null;
    }

    this.connectionType = 'none';
    console.log('Printer disconnected');
  }

  /**
   * Send raw data to printer
   */
  async send(data: Uint8Array): Promise<void> {
    if (this.connectionType === 'webusb' && this.usbDevice) {
      const endpoint = this.findOutputEndpoint(this.usbDevice);
      if (!endpoint) {
        throw new Error('No output endpoint found');
      }
      await this.usbDevice.transferOut(endpoint.endpointNumber, data);
      return;
    }

    if (this.connectionType === 'webserial' && this.writer) {
      await this.writer.write(data);
      return;
    }

    throw new Error('Printer not connected');
  }

  /**
   * Print using ESC/POS commands
   */
  async print(commands: ESCPOSBuilder | Uint8Array): Promise<void> {
    const data = commands instanceof Uint8Array ? commands : commands.build();
    await this.send(data);
  }

  /**
   * Print a receipt
   */
  async printReceipt(data: ReceiptData): Promise<void> {
    const formatter = createReceiptFormatter({
      paperWidth: this.config.paperWidth || 80,
      ...this.receiptConfig,
    });
    const commands = formatter.format(data);
    await this.send(commands);
  }

  /**
   * Print text (convenience method)
   */
  async printText(text: string): Promise<void> {
    const builder = createBuilder();
    builder
      .initialize()
      .text(text)
      .newline()
      .feed(3)
      .cut();
    await this.print(builder);
  }

  /**
   * Open cash drawer
   */
  async openCashDrawer(): Promise<void> {
    const builder = createBuilder();
    builder.openCashDrawer(0);
    await this.print(builder);
    console.log('Cash drawer opened');
  }

  /**
   * Print test page
   */
  async printTestPage(): Promise<void> {
    const builder = createBuilder();
    builder
      .initialize()
      .align(1) // Center
      .size(3) // Double height and width
      .text('TEST PRINT')
      .newline()
      .resetFormat()
      .newline()
      .text('If you can read this,')
      .newline()
      .text('your printer is working!')
      .newline()
      .line('=')
      .newline()
      .text('Date: ' + new Date().toLocaleString())
      .newline()
      .line('=')
      .feed(3)
      .cut();

    await this.print(builder);
    console.log('Test page printed');
  }

  /**
   * Get a new command builder
   */
  createBuilder(): ESCPOSBuilder {
    return createBuilder();
  }
}

// Singleton instance
let printerInstance: ThermalPrinter | null = null;

/**
 * Get the thermal printer instance
 */
export function getThermalPrinter(
  config?: PrinterConfig,
  receiptConfig?: Partial<ReceiptConfig>
): ThermalPrinter {
  if (!printerInstance) {
    printerInstance = new ThermalPrinter(config, receiptConfig);
  }
  return printerInstance;
}

/**
 * Create a new thermal printer instance
 */
export function createThermalPrinter(
  config?: PrinterConfig,
  receiptConfig?: Partial<ReceiptConfig>
): ThermalPrinter {
  return new ThermalPrinter(config, receiptConfig);
}

export default ThermalPrinter;
