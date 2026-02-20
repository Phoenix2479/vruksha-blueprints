/**
 * Printer Connection Service
 * Multi-brand thermal label printer support via WebUSB/WebSerial
 * Supports: Zebra, TSC, Godex, Brother, Dymo
 */

import type { PrinterProfile } from './label-compiler'

// Printer vendor USB IDs
export const PRINTER_VENDORS = {
  ZEBRA: { vendorId: 0x0a5f, name: 'Zebra', language: 'zpl' as const },
  TSC: { vendorId: 0x0dd4, name: 'TSC', language: 'tspl' as const },
  GODEX: { vendorId: 0x195d, name: 'Godex', language: 'zpl' as const },
  BROTHER: { vendorId: 0x04f9, name: 'Brother', language: 'bplc' as const },
  DYMO: { vendorId: 0x0922, name: 'Dymo', language: 'dymo' as const },
  HONEYWELL: { vendorId: 0x0c2e, name: 'Honeywell', language: 'zpl' as const },
  SATO: { vendorId: 0x0828, name: 'Sato', language: 'zpl' as const },
} as const

// Known printer models with their specs
export const KNOWN_PRINTERS: Record<number, { model: string; dpi: 203 | 300 | 600 }> = {
  // Zebra
  0x0100: { model: 'Zebra ZD420', dpi: 203 },
  0x0101: { model: 'Zebra ZD420', dpi: 300 },
  0x0200: { model: 'Zebra ZD620', dpi: 203 },
  0x0201: { model: 'Zebra ZD620', dpi: 300 },
  0x0300: { model: 'Zebra ZT410', dpi: 203 },
  0x0301: { model: 'Zebra ZT410', dpi: 300 },
  0x0302: { model: 'Zebra ZT410', dpi: 600 },
  // TSC
  0x0001: { model: 'TSC TE200', dpi: 203 },
  0x0002: { model: 'TSC TE300', dpi: 300 },
  0x0003: { model: 'TSC TTP-244', dpi: 203 },
  // Dymo
  0x1001: { model: 'Dymo LabelWriter 450', dpi: 300 },
  0x1002: { model: 'Dymo LabelWriter 550', dpi: 300 },
}

// Connection types
export type ConnectionType = 'usb' | 'serial' | 'network' | 'none'

// Printer status
export interface PrinterStatus {
  connected: boolean
  connectionType: ConnectionType
  vendorName?: string
  model?: string
  dpi?: number
  paperOut?: boolean
  headOpen?: boolean
  error?: string
}

// Detection result
export interface DetectedPrinter {
  vendorId: number
  productId: number
  vendorName: string
  model: string
  language: 'zpl' | 'epl' | 'tspl' | 'dymo' | 'bplc'
  dpi: 203 | 300 | 600
  device?: USBDevice
  port?: SerialPort
}

/**
 * Label Printer class - handles WebUSB and WebSerial connections
 */
export class LabelPrinter {
  private usbDevice: USBDevice | null = null
  private serialPort: SerialPort | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private connectionType: ConnectionType = 'none'
  private currentProfile: PrinterProfile | null = null
  private outEndpoint: number = 1

  /**
   * Check if WebUSB is supported
   */
  static isWebUSBSupported(): boolean {
    return 'usb' in navigator
  }

  /**
   * Check if Web Serial is supported
   */
  static isWebSerialSupported(): boolean {
    return 'serial' in navigator
  }

  /**
   * Get list of USB filters for all supported vendors
   */
  static getUSBFilters(): USBDeviceFilter[] {
    return Object.values(PRINTER_VENDORS).map(v => ({ vendorId: v.vendorId }))
  }

  /**
   * Get printer status
   */
  getStatus(): PrinterStatus {
    if (this.connectionType === 'usb' && this.usbDevice) {
      const vendor = this.detectVendor(this.usbDevice.vendorId)
      return {
        connected: true,
        connectionType: 'usb',
        vendorName: vendor?.name,
        model: this.usbDevice.productName || undefined,
      }
    }

    if (this.connectionType === 'serial' && this.serialPort) {
      return {
        connected: true,
        connectionType: 'serial',
        vendorName: 'Serial Printer',
      }
    }

    return { connected: false, connectionType: 'none' }
  }

  /**
   * Detect vendor from ID
   */
  private detectVendor(vendorId: number) {
    return Object.values(PRINTER_VENDORS).find(v => v.vendorId === vendorId)
  }

  /**
   * Detect printer model from product ID
   */
  private detectModel(productId: number): { model: string; dpi: 203 | 300 | 600 } {
    return KNOWN_PRINTERS[productId] || { model: 'Unknown', dpi: 203 }
  }

  /**
   * Request and connect to a USB printer
   */
  async connectUSB(): Promise<DetectedPrinter | null> {
    if (!LabelPrinter.isWebUSBSupported()) {
      throw new Error('WebUSB not supported in this browser')
    }

    try {
      const device = await navigator.usb.requestDevice({
        filters: LabelPrinter.getUSBFilters()
      })

      await device.open()

      // Select configuration
      if (device.configuration === null) {
        await device.selectConfiguration(1)
      }

      // Find printer interface and endpoint
      const printerInterface = this.findPrinterInterface(device)
      await device.claimInterface(printerInterface.interfaceNumber)

      // Find output endpoint
      this.outEndpoint = this.findOutputEndpoint(printerInterface)

      this.usbDevice = device
      this.connectionType = 'usb'

      // Detect vendor and model
      const vendor = this.detectVendor(device.vendorId)
      const modelInfo = this.detectModel(device.productId)

      const result: DetectedPrinter = {
        vendorId: device.vendorId,
        productId: device.productId,
        vendorName: vendor?.name || 'Unknown',
        model: device.productName || modelInfo.model,
        language: vendor?.language || 'zpl',
        dpi: modelInfo.dpi,
        device
      }

      console.log('USB printer connected:', result)
      return result

    } catch (error) {
      console.error('USB connection failed:', error)
      throw error
    }
  }

  /**
   * Find the printer interface
   */
  private findPrinterInterface(device: USBDevice): USBInterface {
    const config = device.configuration
    if (!config) throw new Error('No configuration')

    // Look for printer class (7) or bulk endpoints
    for (const iface of config.interfaces) {
      const alt = iface.alternate
      if (alt.interfaceClass === 7 || // Printer class
          alt.endpoints.some(ep => ep.type === 'bulk' && ep.direction === 'out')) {
        return iface
      }
    }

    // Default to first interface
    return config.interfaces[0]
  }

  /**
   * Find output endpoint number
   */
  private findOutputEndpoint(iface: USBInterface): number {
    const alt = iface.alternate
    for (const endpoint of alt.endpoints) {
      if (endpoint.type === 'bulk' && endpoint.direction === 'out') {
        return endpoint.endpointNumber
      }
    }
    return 1 // Default
  }

  /**
   * Connect to a Serial printer
   */
  async connectSerial(baudRate = 9600): Promise<DetectedPrinter | null> {
    if (!LabelPrinter.isWebSerialSupported()) {
      throw new Error('Web Serial not supported in this browser')
    }

    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate })

      this.serialPort = port
      this.connectionType = 'serial'
      this.writer = port.writable?.getWriter() || null

      const info = port.getInfo()

      const result: DetectedPrinter = {
        vendorId: info.usbVendorId || 0,
        productId: info.usbProductId || 0,
        vendorName: 'Serial',
        model: 'Serial Printer',
        language: 'zpl', // Default to ZPL for serial
        dpi: 203,
        port
      }

      console.log('Serial printer connected:', result)
      return result

    } catch (error) {
      console.error('Serial connection failed:', error)
      throw error
    }
  }

  /**
   * Auto-connect - try USB first, then Serial
   */
  async connect(): Promise<DetectedPrinter | null> {
    if (LabelPrinter.isWebUSBSupported()) {
      try {
        return await this.connectUSB()
      } catch {
        console.log('USB failed, trying Serial...')
      }
    }

    if (LabelPrinter.isWebSerialSupported()) {
      return await this.connectSerial()
    }

    throw new Error('No supported connection method available')
  }

  /**
   * Disconnect from printer
   */
  async disconnect(): Promise<void> {
    if (this.writer) {
      await this.writer.close()
      this.writer = null
    }

    if (this.serialPort) {
      await this.serialPort.close()
      this.serialPort = null
    }

    if (this.usbDevice) {
      await this.usbDevice.close()
      this.usbDevice = null
    }

    this.connectionType = 'none'
    this.currentProfile = null
    console.log('Printer disconnected')
  }

  /**
   * Send raw data to printer
   */
  async sendRaw(data: Uint8Array): Promise<void> {
    if (this.connectionType === 'usb' && this.usbDevice) {
      await this.usbDevice.transferOut(this.outEndpoint, data)
      return
    }

    if (this.connectionType === 'serial' && this.writer) {
      await this.writer.write(data)
      return
    }

    throw new Error('Printer not connected')
  }

  /**
   * Send string command to printer (ZPL, EPL, TSPL, etc.)
   */
  async sendCommand(command: string): Promise<void> {
    const encoder = new TextEncoder()
    const data = encoder.encode(command)
    await this.sendRaw(data)
  }

  /**
   * Print ZPL directly
   */
  async printZPL(zpl: string): Promise<void> {
    console.log('Sending ZPL:', zpl.substring(0, 100) + '...')
    await this.sendCommand(zpl)
  }

  /**
   * Print EPL directly
   */
  async printEPL(epl: string): Promise<void> {
    console.log('Sending EPL:', epl.substring(0, 100) + '...')
    await this.sendCommand(epl)
  }

  /**
   * Print TSPL directly
   */
  async printTSPL(tspl: string): Promise<void> {
    console.log('Sending TSPL:', tspl.substring(0, 100) + '...')
    await this.sendCommand(tspl)
  }

  /**
   * Send host status query (ZPL)
   */
  async queryStatusZPL(): Promise<string> {
    // This would require reading from the device which is more complex
    // For now, return empty
    await this.sendCommand('~HS')
    return ''
  }

  /**
   * Calibrate printer (ZPL auto-calibrate)
   */
  async calibrate(): Promise<void> {
    if (this.connectionType === 'none') {
      throw new Error('Printer not connected')
    }

    // Send ZPL calibration command
    await this.sendCommand('~JC')
    console.log('Calibration command sent')
  }

  /**
   * Feed one label
   */
  async feedLabel(): Promise<void> {
    await this.sendCommand('^XA^XZ') // Empty ZPL format prints one label
  }

  /**
   * Print test pattern
   */
  async printTestPattern(profile: PrinterProfile): Promise<void> {
    const { generateCalibrationPatternZPL } = await import('./label-compiler')
    const zpl = generateCalibrationPatternZPL(profile)
    await this.printZPL(zpl)
  }

  /**
   * Set printer profile
   */
  setProfile(profile: PrinterProfile): void {
    this.currentProfile = profile
  }

  /**
   * Get current profile
   */
  getProfile(): PrinterProfile | null {
    return this.currentProfile
  }
}

// Singleton instance
let printerInstance: LabelPrinter | null = null

/**
 * Get the label printer instance
 */
export function getLabelPrinter(): LabelPrinter {
  if (!printerInstance) {
    printerInstance = new LabelPrinter()
  }
  return printerInstance
}

/**
 * Create a new label printer instance
 */
export function createLabelPrinter(): LabelPrinter {
  return new LabelPrinter()
}

/**
 * Create a default printer profile from detected printer
 */
export function createProfileFromDetected(
  detected: DetectedPrinter,
  labelWidthMm = 50,
  labelHeightMm = 30
): PrinterProfile {
  return {
    id: `${detected.vendorId.toString(16)}-${detected.productId.toString(16)}-${Date.now()}`,
    name: detected.model,
    model: detected.model,
    vendor: detected.vendorName.toLowerCase() as PrinterProfile['vendor'],
    language: detected.language,
    dpi: detected.dpi,
    labelWidthMm,
    labelHeightMm,
    offsetX: 0,
    offsetY: 0,
    darkness: 15,
    speed: 4
  }
}

export default LabelPrinter
