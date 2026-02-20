/**
 * Label Compiler - Converts Fabric.js templates to printer-native commands
 * Supports: ZPL (Zebra), EPL (Eltron), TSPL (TSC), Dymo XML, BPLC (Brother)
 */

import type { LabelTemplate, LabelElement, BarcodeType, FontConfig } from '@/types/barcode'

// Printer profile interface
export interface PrinterProfile {
  id: string
  name: string
  model?: string
  vendor: 'zebra' | 'tsc' | 'godex' | 'brother' | 'dymo' | 'generic'
  language: 'zpl' | 'epl' | 'tspl' | 'dymo' | 'bplc'
  dpi: 203 | 300 | 600
  labelWidthMm: number
  labelHeightMm: number
  offsetX: number // dots
  offsetY: number // dots
  darkness: number // 0-30 for ZPL
  speed: number // 2-6 ips
}

// Conversion utilities
export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi)
}

export function dotsToMm(dots: number, dpi: number): number {
  return (dots / dpi) * 25.4
}

export function ptToDots(pt: number, dpi: number): number {
  return Math.round((pt / 72) * dpi)
}

// ZPL font mapping (A0 is scalable font)
function fontSizeToZPL(fontSize: number, dpi: number): { height: number; width: number } {
  const dots = ptToDots(fontSize, dpi)
  return { height: dots, width: Math.round(dots * 0.6) }
}

// ZPL barcode type mapping
function barcodeTypeToZPL(type: BarcodeType): string {
  const map: Record<BarcodeType, string> = {
    code128: 'BC',
    ean13: 'BE',
    ean8: 'B8',
    upca: 'BU',
    qrcode: 'BQ'
  }
  return map[type] || 'BC'
}

// EPL barcode type mapping
function barcodeTypeToEPL(type: BarcodeType): string {
  const map: Record<BarcodeType, string> = {
    code128: '1',
    ean13: 'E30',
    ean8: 'E80',
    upca: 'UA0',
    qrcode: 'Q' // EPL2 doesn't support QR natively
  }
  return map[type] || '1'
}

// TSPL barcode type mapping
function barcodeTypeToTSPL(type: BarcodeType): string {
  const map: Record<BarcodeType, string> = {
    code128: '128',
    ean13: 'EAN13',
    ean8: 'EAN8',
    upca: 'UPCA',
    qrcode: 'QRCODE'
  }
  return map[type] || '128'
}

/**
 * Compile template to ZPL (Zebra Programming Language)
 */
export function compileToZPL(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  const { dpi, offsetX, offsetY, darkness, speed, labelWidthMm, labelHeightMm } = profile
  const labelWidth = mmToDots(labelWidthMm, dpi)
  const labelHeight = mmToDots(labelHeightMm, dpi)

  let zpl = ''
  
  // Start format
  zpl += '^XA\n'
  
  // Print darkness/density
  zpl += `^MD${darkness}\n`
  
  // Print speed
  zpl += `^PR${speed}\n`
  
  // Label dimensions
  zpl += `^PW${labelWidth}\n`
  zpl += `^LL${labelHeight}\n`

  // Process each element
  for (const element of template.elements.filter(e => e.enabled)) {
    const x = mmToDots(element.x, dpi) + offsetX
    const y = mmToDots(element.y, dpi) + offsetY
    const value = resolveElementValue(element, data)

    if (!value) continue

    if (element.type === 'barcode') {
      const height = mmToDots(element.height || 15, dpi)
      const barcodeCmd = barcodeTypeToZPL(element.barcodeType || 'code128')
      
      if (element.barcodeType === 'qrcode') {
        // QR Code: ^BQN,2,magnification
        const size = Math.max(2, Math.floor(height / 25))
        zpl += `^FO${x},${y}^BQN,2,${size}^FDQA,${value}^FS\n`
      } else {
        // 1D Barcode: ^BCN,height,Y/N (print text below)
        zpl += `^FO${x},${y}^${barcodeCmd}N,${height},Y,N,N^FD${value}^FS\n`
      }
    } else {
      // Text element
      const font = element.font || { family: 'Arial', size: 12, bold: false, italic: false }
      const { height: fontH, width: fontW } = fontSizeToZPL(font.size, dpi)
      
      // Use scalable font A0
      const fontStyle = font.bold ? 'B' : 'N'
      zpl += `^FO${x},${y}^A0${fontStyle},${fontH},${fontW}^FD${value}^FS\n`
    }
  }

  // End format
  zpl += '^XZ\n'
  
  return zpl
}

/**
 * Compile template to EPL (Eltron Programming Language)
 */
export function compileToEPL(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  const { dpi, offsetX, offsetY, labelWidthMm, labelHeightMm } = profile
  const labelHeight = mmToDots(labelHeightMm, dpi)

  let epl = ''
  
  // Clear buffer and set label length
  epl += 'N\n'
  epl += `q${mmToDots(labelWidthMm, dpi)}\n`
  epl += `Q${labelHeight},24\n`

  // Process elements
  for (const element of template.elements.filter(e => e.enabled)) {
    const x = mmToDots(element.x, dpi) + offsetX
    const y = mmToDots(element.y, dpi) + offsetY
    const value = resolveElementValue(element, data)

    if (!value) continue

    if (element.type === 'barcode') {
      const height = mmToDots(element.height || 15, dpi)
      const barcodeType = barcodeTypeToEPL(element.barcodeType || 'code128')
      
      // EPL barcode: B<x>,<y>,<rotation>,<type>,<narrow>,<wide>,<height>,<human>,"<data>"
      epl += `B${x},${y},0,${barcodeType},2,4,${height},B,"${value}"\n`
    } else {
      // Text: A<x>,<y>,<rotation>,<font>,<h_mult>,<v_mult>,<reverse>,"<data>"
      const font = element.font || { size: 12 }
      const fontNum = font.size > 16 ? 4 : font.size > 12 ? 3 : font.size > 8 ? 2 : 1
      epl += `A${x},${y},0,${fontNum},1,1,N,"${value}"\n`
    }
  }

  // Print command
  epl += 'P1\n'
  
  return epl
}

/**
 * Compile template to TSPL (TSC Printers)
 */
export function compileToTSPL(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  const { dpi, offsetX, offsetY, labelWidthMm, labelHeightMm, speed, darkness } = profile

  let tspl = ''
  
  // Size and gap
  tspl += `SIZE ${labelWidthMm} mm, ${labelHeightMm} mm\n`
  tspl += 'GAP 3 mm, 0 mm\n'
  tspl += `SPEED ${speed}\n`
  tspl += `DENSITY ${darkness}\n`
  tspl += 'DIRECTION 1\n'
  tspl += 'CLS\n'

  // Process elements
  for (const element of template.elements.filter(e => e.enabled)) {
    const x = mmToDots(element.x, dpi) + offsetX
    const y = mmToDots(element.y, dpi) + offsetY
    const value = resolveElementValue(element, data)

    if (!value) continue

    if (element.type === 'barcode') {
      const height = mmToDots(element.height || 15, dpi)
      const barcodeType = barcodeTypeToTSPL(element.barcodeType || 'code128')
      
      if (element.barcodeType === 'qrcode') {
        tspl += `QRCODE ${x},${y},L,4,A,0,"${value}"\n`
      } else {
        // BARCODE x,y,"type",height,human,rotation,narrow,wide,"content"
        tspl += `BARCODE ${x},${y},"${barcodeType}",${height},1,0,2,4,"${value}"\n`
      }
    } else {
      const font = element.font || { size: 12 }
      // TEXT x,y,"font",rotation,x_mult,y_mult,"content"
      const fontName = font.size > 16 ? '4' : font.size > 12 ? '3' : '2'
      tspl += `TEXT ${x},${y},"${fontName}",0,1,1,"${value}"\n`
    }
  }

  tspl += 'PRINT 1\n'
  
  return tspl
}

/**
 * Compile template to Dymo XML (LabelWriter)
 */
export function compileToDymo(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  const { labelWidthMm, labelHeightMm } = profile
  
  // Convert mm to 1/100 inch (Dymo uses this unit)
  const widthInch = (labelWidthMm / 25.4) * 100
  const heightInch = (labelHeightMm / 25.4) * 100

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n'
  xml += '<DieCutLabel Version="8.0" Units="twips">\n'
  xml += `  <PaperOrientation>Landscape</PaperOrientation>\n`
  xml += `  <Id>Address</Id>\n`
  xml += `  <PaperName>30252 Address</PaperName>\n`
  xml += `  <DrawCommands>\n`

  for (const element of template.elements.filter(e => e.enabled)) {
    const x = Math.round(element.x * 56.7) // mm to twips
    const y = Math.round(element.y * 56.7)
    const value = resolveElementValue(element, data)

    if (!value) continue

    if (element.type === 'barcode') {
      const width = Math.round((element.width || 40) * 56.7)
      const height = Math.round((element.height || 15) * 56.7)
      xml += `    <DrawBarcode X="${x}" Y="${y}" Width="${width}" Height="${height}">\n`
      xml += `      <Type>Code128</Type>\n`
      xml += `      <Text>${escapeXml(value)}</Text>\n`
      xml += `    </DrawBarcode>\n`
    } else {
      const font = element.font || { family: 'Arial', size: 12, bold: false }
      const fontHeight = Math.round(font.size * 20) // pt to twips
      xml += `    <DrawText X="${x}" Y="${y}">\n`
      xml += `      <Font Family="${font.family}" Size="${fontHeight}" Bold="${font.bold}" Italic="${font.italic || false}"/>\n`
      xml += `      <Text>${escapeXml(value)}</Text>\n`
      xml += `    </DrawText>\n`
    }
  }

  xml += `  </DrawCommands>\n`
  xml += '</DieCutLabel>\n'

  return xml
}

/**
 * Compile template to BPLC (Brother P-touch)
 */
export function compileToBPLC(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  const { dpi, labelWidthMm, labelHeightMm } = profile
  
  let bplc = ''
  
  // Initialize
  bplc += '\x1B@' // ESC @: Initialize
  bplc += '\x1BiS' // Print information command
  
  // Set media size
  const width = mmToDots(labelWidthMm, dpi)
  const height = mmToDots(labelHeightMm, dpi)
  bplc += `\x1BiA${String.fromCharCode(width & 0xFF)}${String.fromCharCode((width >> 8) & 0xFF)}`
  
  for (const element of template.elements.filter(e => e.enabled)) {
    const x = mmToDots(element.x, dpi)
    const y = mmToDots(element.y, dpi)
    const value = resolveElementValue(element, data)

    if (!value) continue

    // Position
    bplc += `\x1B$${String.fromCharCode(x & 0xFF)}${String.fromCharCode((x >> 8) & 0xFF)}`
    
    if (element.type === 'barcode') {
      // Brother barcode command (simplified)
      bplc += '\x1Di' // Barcode mode
      bplc += 'B' // Code 128
      bplc += value
      bplc += '\x00'
    } else {
      // Text
      bplc += value
    }
  }
  
  // Print
  bplc += '\x0C' // Form feed / print

  return bplc
}

/**
 * Resolve element value from template and data
 */
function resolveElementValue(element: LabelElement, data: Record<string, string>): string {
  const prefix = element.prefix || ''
  const suffix = element.suffix || ''
  
  let value = ''
  
  switch (element.type) {
    case 'productName':
      value = data.name || data.productName || ''
      break
    case 'price':
      value = data.price ? `${element.currencySymbol || '₹'}${data.price}` : ''
      break
    case 'mrp':
      value = data.mrp ? `${element.currencySymbol || '₹'}${data.mrp}` : ''
      break
    case 'sku':
      value = data.sku || ''
      break
    case 'batchNo':
      value = data.batchNo || data.batch || ''
      break
    case 'expiryDate':
      value = data.expiryDate || data.expiry || ''
      break
    case 'weight':
      value = data.weight || ''
      break
    case 'barcode':
      value = data.barcode || data.sku || ''
      break
    case 'customText':
      value = element.value || ''
      break
    default:
      value = ''
  }

  return value ? `${prefix}${value}${suffix}` : ''
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Main compile function - routes to appropriate compiler
 */
export function compileLabel(
  template: LabelTemplate,
  profile: PrinterProfile,
  data: Record<string, string> = {}
): string {
  switch (profile.language) {
    case 'zpl':
      return compileToZPL(template, profile, data)
    case 'epl':
      return compileToEPL(template, profile, data)
    case 'tspl':
      return compileToTSPL(template, profile, data)
    case 'dymo':
      return compileToDymo(template, profile, data)
    case 'bplc':
      return compileToBPLC(template, profile, data)
    default:
      return compileToZPL(template, profile, data)
  }
}

/**
 * Generate test pattern ZPL for calibration
 */
export function generateCalibrationPatternZPL(profile: PrinterProfile): string {
  const { dpi, labelWidthMm, labelHeightMm, darkness } = profile
  const w = mmToDots(labelWidthMm, dpi)
  const h = mmToDots(labelHeightMm, dpi)
  
  // Crosshair positions (corners and center)
  const margin = mmToDots(5, dpi)
  const crossSize = mmToDots(3, dpi)
  
  let zpl = '^XA\n'
  zpl += `^MD${darkness}\n`
  zpl += `^PW${w}\n`
  zpl += `^LL${h}\n`
  
  // Top-left crosshair
  zpl += `^FO${margin},${margin}^GB${crossSize},1,1^FS\n`
  zpl += `^FO${margin + crossSize/2},${margin - crossSize/2}^GB1,${crossSize},1^FS\n`
  
  // Top-right crosshair
  zpl += `^FO${w - margin - crossSize},${margin}^GB${crossSize},1,1^FS\n`
  zpl += `^FO${w - margin - crossSize/2},${margin - crossSize/2}^GB1,${crossSize},1^FS\n`
  
  // Bottom-left crosshair
  zpl += `^FO${margin},${h - margin}^GB${crossSize},1,1^FS\n`
  zpl += `^FO${margin + crossSize/2},${h - margin - crossSize/2}^GB1,${crossSize},1^FS\n`
  
  // Bottom-right crosshair
  zpl += `^FO${w - margin - crossSize},${h - margin}^GB${crossSize},1,1^FS\n`
  zpl += `^FO${w - margin - crossSize/2},${h - margin - crossSize/2}^GB1,${crossSize},1^FS\n`
  
  // Center crosshair
  const cx = w / 2
  const cy = h / 2
  zpl += `^FO${cx - crossSize/2},${cy}^GB${crossSize},1,1^FS\n`
  zpl += `^FO${cx},${cy - crossSize/2}^GB1,${crossSize},1^FS\n`
  
  // Reference text
  zpl += `^FO${margin},${margin + crossSize + 10}^A0N,20,20^FDCALIBRATION TEST^FS\n`
  zpl += `^FO${margin},${margin + crossSize + 35}^A0N,16,16^FD${labelWidthMm}mm x ${labelHeightMm}mm @ ${dpi}dpi^FS\n`
  
  zpl += '^XZ\n'
  
  return zpl
}

export default {
  compileLabel,
  compileToZPL,
  compileToEPL,
  compileToTSPL,
  compileToDymo,
  compileToBPLC,
  generateCalibrationPatternZPL,
  mmToDots,
  dotsToMm
}
