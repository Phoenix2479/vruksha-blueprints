/**
 * Smart Barcode Validator
 * Provides forgiving validation with auto-suggestions instead of hard errors
 */

import type { BarcodeType } from '@/types/barcode'

// Validation result with suggestions
export interface BarcodeSuggestion {
  valid: boolean
  original: string
  suggested?: string
  action?: 'pad' | 'trim' | 'add_checkdigit' | 'change_type' | 'none'
  newType?: BarcodeType
  reason: string
  confidence: number // 0-1 how confident we are in the suggestion
}

// Correction record for learning
export interface BarcodeCorrection {
  originalData: string
  correctedData: string
  symbologyUsed: BarcodeType
  symbologySuggested?: BarcodeType
  userAccepted: boolean
}

/**
 * Calculate UPC-A check digit
 */
export function calculateUPCACheckDigit(data: string): string {
  const digits = data.slice(0, 11).split('').map(Number)
  let sum = 0
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1)
  }
  return String((10 - (sum % 10)) % 10)
}

/**
 * Calculate EAN-13 check digit
 */
export function calculateEAN13CheckDigit(data: string): string {
  const digits = data.slice(0, 12).split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (sum % 10)) % 10)
}

/**
 * Calculate EAN-8 check digit
 */
export function calculateEAN8CheckDigit(data: string): string {
  const digits = data.slice(0, 7).split('').map(Number)
  let sum = 0
  for (let i = 0; i < 7; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1)
  }
  return String((10 - (sum % 10)) % 10)
}

/**
 * Verify check digit is correct
 */
export function verifyCheckDigit(data: string, type: BarcodeType): boolean {
  switch (type) {
    case 'upca':
      if (data.length !== 12) return false
      return data[11] === calculateUPCACheckDigit(data)
    case 'ean13':
      if (data.length !== 13) return false
      return data[12] === calculateEAN13CheckDigit(data)
    case 'ean8':
      if (data.length !== 8) return false
      return data[7] === calculateEAN8CheckDigit(data)
    default:
      return true
  }
}

/**
 * Auto-detect best barcode type from data
 */
export function autoDetectBarcodeType(data: string): BarcodeType {
  const cleaned = data.trim()
  
  // Check for URL or long text → QR Code
  if (cleaned.startsWith('http') || cleaned.length > 50) {
    return 'qrcode'
  }
  
  // Pure digits
  if (/^\d+$/.test(cleaned)) {
    const len = cleaned.length
    
    // EAN-8: 7-8 digits
    if (len === 7 || len === 8) {
      return 'ean8'
    }
    
    // UPC-A: 11-12 digits
    if (len === 11 || len === 12) {
      return 'upca'
    }
    
    // EAN-13: 12-13 digits
    if (len === 12 || len === 13) {
      return 'ean13'
    }
  }
  
  // Has letters or special chars → Code 128
  return 'code128'
}

/**
 * Suggest barcode fix with friendly messages
 */
export function suggestBarcodeFix(data: string, selectedType: BarcodeType): BarcodeSuggestion {
  const cleaned = data.trim()
  
  if (!cleaned) {
    return {
      valid: false,
      original: data,
      reason: 'Barcode data is empty',
      confidence: 1
    }
  }

  // ============================================
  // UPC-A Validation & Suggestions
  // ============================================
  if (selectedType === 'upca') {
    // Contains letters → suggest Code 128
    if (/[a-zA-Z]/.test(cleaned)) {
      return {
        valid: false,
        original: cleaned,
        suggested: cleaned,
        action: 'change_type',
        newType: 'code128',
        reason: 'UPC-A only supports digits. Switch to Code 128 for alphanumeric data?',
        confidence: 0.95
      }
    }
    
    // Not all digits
    if (!/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        original: cleaned,
        reason: 'UPC-A requires numeric digits only',
        confidence: 1
      }
    }
    
    // 11 digits → add check digit
    if (cleaned.length === 11) {
      const checkDigit = calculateUPCACheckDigit(cleaned)
      return {
        valid: false,
        original: cleaned,
        suggested: cleaned + checkDigit,
        action: 'add_checkdigit',
        reason: `UPC-A needs 12 digits. Add check digit "${checkDigit}"?`,
        confidence: 0.98
      }
    }
    
    // 12 digits → verify check digit
    if (cleaned.length === 12) {
      if (!verifyCheckDigit(cleaned, 'upca')) {
        const correct = cleaned.slice(0, 11) + calculateUPCACheckDigit(cleaned)
        return {
          valid: false,
          original: cleaned,
          suggested: correct,
          action: 'add_checkdigit',
          reason: `Check digit incorrect. Should be "${correct[11]}" not "${cleaned[11]}"`,
          confidence: 0.99
        }
      }
      return { valid: true, original: cleaned, reason: 'Valid UPC-A', confidence: 1, action: 'none' }
    }
    
    // Wrong length
    if (cleaned.length < 11) {
      const padded = cleaned.padStart(11, '0')
      const checkDigit = calculateUPCACheckDigit(padded)
      return {
        valid: false,
        original: cleaned,
        suggested: padded + checkDigit,
        action: 'pad',
        reason: `UPC-A needs 12 digits. Pad with zeros to "${padded + checkDigit}"?`,
        confidence: 0.7
      }
    }
    
    // Too long
    return {
      valid: false,
      original: cleaned,
      action: 'change_type',
      newType: 'code128',
      reason: 'Too many digits for UPC-A (max 12). Use Code 128 instead?',
      confidence: 0.85
    }
  }

  // ============================================
  // EAN-13 Validation & Suggestions
  // ============================================
  if (selectedType === 'ean13') {
    if (!/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'code128',
        reason: 'EAN-13 requires digits only. Use Code 128 for alphanumeric?',
        confidence: 0.95
      }
    }
    
    // 8 digits → might be EAN-8
    if (cleaned.length === 8 || cleaned.length === 7) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'ean8',
        reason: `Only ${cleaned.length} digits. Did you mean EAN-8?`,
        confidence: 0.9
      }
    }
    
    // 12 digits → add check digit
    if (cleaned.length === 12) {
      const checkDigit = calculateEAN13CheckDigit(cleaned)
      return {
        valid: false,
        original: cleaned,
        suggested: cleaned + checkDigit,
        action: 'add_checkdigit',
        reason: `EAN-13 needs 13 digits. Add check digit "${checkDigit}"?`,
        confidence: 0.98
      }
    }
    
    // 13 digits → verify
    if (cleaned.length === 13) {
      if (!verifyCheckDigit(cleaned, 'ean13')) {
        const correct = cleaned.slice(0, 12) + calculateEAN13CheckDigit(cleaned)
        return {
          valid: false,
          original: cleaned,
          suggested: correct,
          action: 'add_checkdigit',
          reason: `Check digit incorrect. Should be "${correct[12]}"`,
          confidence: 0.99
        }
      }
      return { valid: true, original: cleaned, reason: 'Valid EAN-13', confidence: 1, action: 'none' }
    }
    
    // Wrong length
    return {
      valid: false,
      original: cleaned,
      reason: `EAN-13 requires 12-13 digits, got ${cleaned.length}`,
      confidence: 0.8
    }
  }

  // ============================================
  // EAN-8 Validation & Suggestions
  // ============================================
  if (selectedType === 'ean8') {
    if (!/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'code128',
        reason: 'EAN-8 requires digits only. Use Code 128?',
        confidence: 0.95
      }
    }
    
    // 7 digits → add check digit
    if (cleaned.length === 7) {
      const checkDigit = calculateEAN8CheckDigit(cleaned)
      return {
        valid: false,
        original: cleaned,
        suggested: cleaned + checkDigit,
        action: 'add_checkdigit',
        reason: `EAN-8 needs 8 digits. Add check digit "${checkDigit}"?`,
        confidence: 0.98
      }
    }
    
    // 8 digits → verify
    if (cleaned.length === 8) {
      if (!verifyCheckDigit(cleaned, 'ean8')) {
        const correct = cleaned.slice(0, 7) + calculateEAN8CheckDigit(cleaned)
        return {
          valid: false,
          original: cleaned,
          suggested: correct,
          action: 'add_checkdigit',
          reason: `Check digit incorrect. Should be "${correct[7]}"`,
          confidence: 0.99
        }
      }
      return { valid: true, original: cleaned, reason: 'Valid EAN-8', confidence: 1, action: 'none' }
    }
    
    // Too many digits → might be EAN-13
    if (cleaned.length >= 12) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'ean13',
        reason: `${cleaned.length} digits is too many for EAN-8. Use EAN-13?`,
        confidence: 0.9
      }
    }
    
    return {
      valid: false,
      original: cleaned,
      reason: `EAN-8 requires 7-8 digits, got ${cleaned.length}`,
      confidence: 0.8
    }
  }

  // ============================================
  // Code 128 Validation & Suggestions
  // ============================================
  if (selectedType === 'code128') {
    // Check for non-ASCII
    if (!/^[\x00-\x7F]*$/.test(cleaned)) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'qrcode',
        reason: 'Code 128 only supports ASCII. Use QR Code for Unicode?',
        confidence: 0.9
      }
    }
    
    // Too long
    if (cleaned.length > 80) {
      return {
        valid: false,
        original: cleaned,
        action: 'change_type',
        newType: 'qrcode',
        reason: 'Data too long for Code 128 (max ~80 chars). Use QR Code?',
        confidence: 0.95
      }
    }
    
    // Pure digits but could be EAN/UPC
    if (/^\d+$/.test(cleaned)) {
      if (cleaned.length === 12 || cleaned.length === 11) {
        return {
          valid: true,
          original: cleaned,
          suggested: cleaned.length === 11 ? cleaned + calculateUPCACheckDigit(cleaned) : cleaned,
          action: 'change_type',
          newType: 'upca',
          reason: 'This looks like a UPC-A. Switch for better scanning?',
          confidence: 0.7
        }
      }
      if (cleaned.length === 13 || cleaned.length === 12) {
        return {
          valid: true,
          original: cleaned,
          suggested: cleaned.length === 12 ? cleaned + calculateEAN13CheckDigit(cleaned) : cleaned,
          action: 'change_type',
          newType: 'ean13',
          reason: 'This looks like an EAN-13. Switch for better scanning?',
          confidence: 0.7
        }
      }
    }
    
    return { valid: true, original: cleaned, reason: 'Valid Code 128', confidence: 1, action: 'none' }
  }

  // ============================================
  // QR Code Validation
  // ============================================
  if (selectedType === 'qrcode') {
    if (cleaned.length > 4296) {
      return {
        valid: false,
        original: cleaned,
        suggested: cleaned.substring(0, 4296),
        action: 'trim',
        reason: 'QR Code max capacity is ~4000 alphanumeric chars',
        confidence: 1
      }
    }
    
    return { valid: true, original: cleaned, reason: 'Valid QR Code data', confidence: 1, action: 'none' }
  }

  // Default: valid
  return { valid: true, original: cleaned, reason: 'Valid barcode data', confidence: 1, action: 'none' }
}

/**
 * Get friendly suggestion message for UI display
 */
export function getSuggestionMessage(suggestion: BarcodeSuggestion): string {
  if (suggestion.valid && suggestion.action === 'none') {
    return '✓ ' + suggestion.reason
  }
  
  if (suggestion.action === 'change_type' && suggestion.newType) {
    return `💡 ${suggestion.reason}`
  }
  
  if (suggestion.action === 'add_checkdigit') {
    return `🔢 ${suggestion.reason}`
  }
  
  if (suggestion.action === 'pad') {
    return `📏 ${suggestion.reason}`
  }
  
  return `⚠️ ${suggestion.reason}`
}

/**
 * Get suggestion severity for UI styling
 */
export function getSuggestionSeverity(suggestion: BarcodeSuggestion): 'success' | 'warning' | 'error' | 'info' {
  if (suggestion.valid && suggestion.action === 'none') {
    return 'success'
  }
  
  if (suggestion.valid && suggestion.action === 'change_type') {
    return 'info' // Suggestion but not required
  }
  
  if (suggestion.suggested && suggestion.confidence > 0.8) {
    return 'warning' // Fixable
  }
  
  return 'error'
}

/**
 * Apply suggestion automatically
 */
export function applySuggestion(suggestion: BarcodeSuggestion): { data: string; type: BarcodeType } {
  if (suggestion.action === 'change_type' && suggestion.newType) {
    return {
      data: suggestion.suggested || suggestion.original,
      type: suggestion.newType
    }
  }
  
  if (suggestion.suggested) {
    return {
      data: suggestion.suggested,
      type: suggestion.newType || autoDetectBarcodeType(suggestion.suggested)
    }
  }
  
  return {
    data: suggestion.original,
    type: autoDetectBarcodeType(suggestion.original)
  }
}

export default {
  suggestBarcodeFix,
  autoDetectBarcodeType,
  calculateUPCACheckDigit,
  calculateEAN13CheckDigit,
  calculateEAN8CheckDigit,
  verifyCheckDigit,
  getSuggestionMessage,
  getSuggestionSeverity,
  applySuggestion
}
