/**
 * Fabric.js v7 Helpers with Extended Types
 * 
 * This module provides type-safe wrappers around Fabric.js v7 to handle:
 * - Custom data properties on objects
 * - Proper TypeScript types
 * - Helper functions for common operations
 */

import {
  Canvas,
  FabricObject,
  FabricText,
  FabricImage,
  Rect,
  Group,
  Point,
  type TPointerEvent,
  type TPointerEventInfo,
  type CanvasEvents,
} from 'fabric'
import type { LabelElement, LabelSize, Product, BarcodeType } from '@/types/barcode'
import { generateBarcodeDataURL } from './barcode-generator'

// ============================================================================
// Type Extensions
// ============================================================================

/** Custom metadata we attach to Fabric objects */
export interface ElementMetadata {
  elementId: string
  elementType: LabelElement['type']
  isBackground?: boolean
}

/** Extended Fabric object with our custom data */
export interface ExtendedFabricObject extends FabricObject {
  _elementData?: ElementMetadata
}

/** Type guard to check if object has our metadata */
export function hasElementData(obj: FabricObject | null | undefined): obj is ExtendedFabricObject {
  return obj != null && '_elementData' in obj && obj._elementData != null
}

/** Get element data from a Fabric object */
export function getElementData(obj: FabricObject | null | undefined): ElementMetadata | null {
  if (hasElementData(obj)) {
    return obj._elementData ?? null
  }
  return null
}

/** Set element data on a Fabric object */
export function setElementData(obj: FabricObject, data: ElementMetadata): void {
  (obj as ExtendedFabricObject)._elementData = data
}

// ============================================================================
// Constants
// ============================================================================

export const MM_TO_PX = 3.7795275591
export const PX_TO_MM = 1 / MM_TO_PX

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX
}

export function pxToMm(px: number): number {
  return px * PX_TO_MM
}

// Selection colors
const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'
const SELECTION_BORDER_COLOR = '#3b82f6'
const CORNER_COLOR = '#3b82f6'

// ============================================================================
// Canvas Configuration
// ============================================================================

export interface CanvasConfig {
  gridSize: number
  gridEnabled: boolean
  snapToGrid: boolean
  showRulers: boolean
  zoom: number
  backgroundColor: string
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  gridSize: 5,
  gridEnabled: true,
  snapToGrid: true,
  showRulers: true,
  zoom: 1,
  backgroundColor: '#ffffff',
}

// ============================================================================
// Canvas Factory
// ============================================================================

export interface CreateCanvasOptions {
  canvasId: string
  width: number
  height: number
  config?: Partial<CanvasConfig>
}

export function createCanvas(options: CreateCanvasOptions): Canvas {
  const { canvasId, width, height, config = {} } = options
  const mergedConfig = { ...DEFAULT_CANVAS_CONFIG, ...config }

  const canvas = new Canvas(canvasId, {
    width,
    height,
    backgroundColor: '#f5f5f5',
    selection: true,
    selectionColor: SELECTION_COLOR,
    selectionBorderColor: SELECTION_BORDER_COLOR,
    selectionLineWidth: 1,
    preserveObjectStacking: true,
  })

  // Configure default object controls
  FabricObject.prototype.set({
    cornerColor: CORNER_COLOR,
    cornerStyle: 'circle',
    cornerSize: 8,
    transparentCorners: false,
    borderColor: SELECTION_BORDER_COLOR,
    borderScaleFactor: 1.5,
  })

  return canvas
}

// ============================================================================
// Label Background
// ============================================================================

export function createLabelBackground(
  labelSize: LabelSize,
  zoom: number,
  offsetX: number = 0,
  offsetY: number = 0
): Rect {
  const width = mmToPx(labelSize.width) * zoom
  const height = mmToPx(labelSize.height) * zoom

  const rect = new Rect({
    left: offsetX,
    top: offsetY,
    width,
    height,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 1,
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })

  setElementData(rect, {
    elementId: '__background__',
    elementType: 'customText',
    isBackground: true,
  })

  return rect
}

// ============================================================================
// Grid Rendering
// ============================================================================

export function drawGrid(
  canvas: Canvas,
  labelSize: LabelSize,
  config: CanvasConfig,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  if (!config.gridEnabled) return

  const gridSizePx = mmToPx(config.gridSize) * config.zoom
  const width = mmToPx(labelSize.width) * config.zoom
  const height = mmToPx(labelSize.height) * config.zoom

  const ctx = canvas.getContext()
  ctx.save()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 0.5

  // Vertical lines
  for (let x = offsetX; x <= offsetX + width; x += gridSizePx) {
    ctx.beginPath()
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + height)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = offsetY; y <= offsetY + height; y += gridSizePx) {
    ctx.beginPath()
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + width, y)
    ctx.stroke()
  }

  ctx.restore()
}

// ============================================================================
// Element Creation
// ============================================================================

export interface CreateElementOptions {
  element: LabelElement
  product: Product | null
  zoom: number
  offsetX?: number
  offsetY?: number
}

/** Get display value for an element */
function getElementDisplayValue(element: LabelElement, product: Product | null): string {
  const prefix = element.prefix || ''
  const suffix = element.suffix || ''

  let value = ''
  if (!product) {
    // Preview placeholders
    switch (element.type) {
      case 'productName': value = 'Product Name'; break
      case 'price': value = `${element.currencySymbol || '₹'}99.00`; break
      case 'mrp': value = `${element.currencySymbol || '₹'}120.00`; break
      case 'sku': value = 'SKU001'; break
      case 'batchNo': value = 'BATCH001'; break
      case 'expiryDate': value = '31/12/2026'; break
      case 'weight': value = '500g'; break
      case 'customText': value = element.value || 'Custom Text'; break
      default: value = ''
    }
  } else {
    switch (element.type) {
      case 'productName': value = product.name; break
      case 'price': value = `${element.currencySymbol || '₹'}${product.price.toFixed(2)}`; break
      case 'mrp': value = `${element.currencySymbol || '₹'}${product.mrp.toFixed(2)}`; break
      case 'sku': value = product.sku; break
      case 'batchNo': value = product.batchNo || ''; break
      case 'expiryDate': value = product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : ''; break
      case 'weight': value = product.weight || ''; break
      case 'customText': value = element.value || ''; break
      default: value = ''
    }
  }

  return `${prefix}${value}${suffix}`
}

/** Create a text element */
function createTextElement(
  element: LabelElement,
  product: Product | null,
  zoom: number,
  offsetX: number,
  offsetY: number
): FabricText {
  const x = offsetX + mmToPx(element.x) * zoom
  const y = offsetY + mmToPx(element.y) * zoom
  const displayText = getElementDisplayValue(element, product)
  const fontSize = (element.font?.size || 12) * zoom

  const text = new FabricText(displayText, {
    left: x,
    top: y,
    fontSize,
    fontFamily: element.font?.family || 'Arial',
    fontWeight: element.font?.bold ? 'bold' : 'normal',
    fontStyle: element.font?.italic ? 'italic' : 'normal',
    fill: element.type === 'mrp' ? '#666666' : '#000000',
    linethrough: element.type === 'mrp',
    selectable: true,
    hasControls: true,
    lockScalingFlip: true,
  })

  setElementData(text, {
    elementId: element.id,
    elementType: element.type,
  })

  return text
}

/** Create a barcode element (async) */
async function createBarcodeElement(
  element: LabelElement,
  product: Product | null,
  zoom: number,
  offsetX: number,
  offsetY: number
): Promise<FabricImage | null> {
  const x = offsetX + mmToPx(element.x) * zoom
  const y = offsetY + mmToPx(element.y) * zoom
  const targetWidth = mmToPx(element.width || 40) * zoom
  const targetHeight = mmToPx(element.height || 15) * zoom

  // Get barcode value
  const value = product?.barcode || product?.sku || '1234567890128'

  const result = await generateBarcodeDataURL({
    type: element.barcodeType || 'code128',
    value,
    width: 2,
    height: Math.round(targetHeight),
    displayValue: true,
  })

  if (!result.success || !result.dataUrl) {
    console.warn('Failed to generate barcode:', result.error)
    return null
  }

  return new Promise((resolve) => {
    FabricImage.fromURL(result.dataUrl!).then((img) => {
      const scaleX = targetWidth / (img.width || targetWidth)
      const scaleY = targetHeight / (img.height || targetHeight)

      img.set({
        left: x,
        top: y,
        scaleX,
        scaleY,
        selectable: true,
        hasControls: true,
        lockScalingFlip: true,
      })

      setElementData(img, {
        elementId: element.id,
        elementType: element.type,
      })

      resolve(img)
    }).catch((err) => {
      console.error('Failed to load barcode image:', err)
      resolve(null)
    })
  })
}

/** Create a Fabric object from a LabelElement */
export async function createFabricElement(
  options: CreateElementOptions
): Promise<FabricObject | null> {
  const { element, product, zoom, offsetX = 0, offsetY = 0 } = options

  if (!element.enabled) {
    return null
  }

  if (element.type === 'barcode') {
    return createBarcodeElement(element, product, zoom, offsetX, offsetY)
  }

  return createTextElement(element, product, zoom, offsetX, offsetY)
}

// ============================================================================
// Position Conversion
// ============================================================================

export interface ElementPosition {
  x: number
  y: number
  width?: number
  height?: number
}

/** Convert Fabric object position to mm coordinates */
export function fabricToMm(
  obj: FabricObject,
  zoom: number,
  offsetX: number = 0,
  offsetY: number = 0
): ElementPosition {
  const left = obj.left ?? 0
  const top = obj.top ?? 0
  const scaleX = obj.scaleX ?? 1
  const scaleY = obj.scaleY ?? 1
  const width = obj.width ?? 0
  const height = obj.height ?? 0

  return {
    x: pxToMm((left - offsetX) / zoom),
    y: pxToMm((top - offsetY) / zoom),
    width: width > 0 ? pxToMm((width * scaleX) / zoom) : undefined,
    height: height > 0 ? pxToMm((height * scaleY) / zoom) : undefined,
  }
}

// ============================================================================
// Snap to Grid
// ============================================================================

export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value
  return Math.round(value / gridSize) * gridSize
}

export function snapObjectToGrid(
  obj: FabricObject,
  gridSizeMm: number,
  zoom: number,
  enabled: boolean,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  if (!enabled) return

  const gridSizePx = mmToPx(gridSizeMm) * zoom
  const left = obj.left ?? 0
  const top = obj.top ?? 0

  // Snap relative to offset
  const relativeLeft = left - offsetX
  const relativeTop = top - offsetY

  const snappedLeft = Math.round(relativeLeft / gridSizePx) * gridSizePx + offsetX
  const snappedTop = Math.round(relativeTop / gridSizePx) * gridSizePx + offsetY

  obj.set({ left: snappedLeft, top: snappedTop })
}

// ============================================================================
// Undo/Redo Manager
// ============================================================================

export interface HistoryState {
  elements: LabelElement[]
  timestamp: number
}

export class UndoRedoManager {
  private history: HistoryState[] = []
  private currentIndex = -1
  private maxHistory = 50
  private isRestoring = false

  /** Check if currently restoring (to prevent saving during restore) */
  get isRestoringState(): boolean {
    return this.isRestoring
  }

  /** Save current state */
  save(elements: LabelElement[]): void {
    if (this.isRestoring) return

    // Remove future states if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1)
    }

    // Deep clone elements
    const state: HistoryState = {
      elements: JSON.parse(JSON.stringify(elements)),
      timestamp: Date.now(),
    }

    this.history.push(state)

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    } else {
      this.currentIndex++
    }
  }

  /** Undo to previous state */
  undo(): LabelElement[] | null {
    if (!this.canUndo()) return null

    this.isRestoring = true
    this.currentIndex--
    const state = this.history[this.currentIndex]
    this.isRestoring = false

    return JSON.parse(JSON.stringify(state.elements))
  }

  /** Redo to next state */
  redo(): LabelElement[] | null {
    if (!this.canRedo()) return null

    this.isRestoring = true
    this.currentIndex++
    const state = this.history[this.currentIndex]
    this.isRestoring = false

    return JSON.parse(JSON.stringify(state.elements))
  }

  canUndo(): boolean {
    return this.currentIndex > 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  clear(): void {
    this.history = []
    this.currentIndex = -1
  }

  /** Initialize with first state */
  init(elements: LabelElement[]): void {
    this.clear()
    this.save(elements)
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

export interface KeyboardHandlers {
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onDeselect: () => void
  onDuplicate: () => void
}

export function handleKeyboardShortcut(
  e: KeyboardEvent,
  handlers: KeyboardHandlers
): boolean {
  // Don't handle if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return false
  }

  const isCtrlOrCmd = e.ctrlKey || e.metaKey

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    handlers.onDelete()
    return true
  }

  if (isCtrlOrCmd) {
    switch (e.key.toLowerCase()) {
      case 'c':
        e.preventDefault()
        handlers.onCopy()
        return true
      case 'v':
        e.preventDefault()
        handlers.onPaste()
        return true
      case 'd':
        e.preventDefault()
        handlers.onDuplicate()
        return true
      case 'z':
        e.preventDefault()
        if (e.shiftKey) {
          handlers.onRedo()
        } else {
          handlers.onUndo()
        }
        return true
      case 'y':
        e.preventDefault()
        handlers.onRedo()
        return true
      case 'a':
        e.preventDefault()
        handlers.onSelectAll()
        return true
    }
  }

  if (e.key === 'Escape') {
    handlers.onDeselect()
    return true
  }

  return false
}

// ============================================================================
// Zoom Helpers
// ============================================================================

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export function getNextZoomLevel(current: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    const next = ZOOM_LEVELS.find(z => z > current)
    return next ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
  } else {
    const prev = [...ZOOM_LEVELS].reverse().find(z => z < current)
    return prev ?? ZOOM_LEVELS[0]
  }
}

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], zoom))
}
