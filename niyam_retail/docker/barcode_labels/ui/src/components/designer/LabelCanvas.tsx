/**
 * LabelCanvas - Fabric.js v7 WYSIWYG Label Editor
 * 
 * Features:
 * - Drag and drop element positioning
 * - Click to select elements on canvas
 * - Resize handles
 * - Grid with snap-to-grid
 * - Undo/Redo support
 * - Keyboard shortcuts
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Canvas, FabricObject, FabricText, FabricImage, Rect } from 'fabric'
import type { LabelElement, LabelSize, Product } from '@/types/barcode'
import {
  createLabelBackground,
  createFabricElement,
  fabricToMm,
  snapObjectToGrid,
  getElementData,
  hasElementData,
  setElementData,
  handleKeyboardShortcut,
  UndoRedoManager,
  getNextZoomLevel,
  mmToPx,
  type CanvasConfig,
  DEFAULT_CANVAS_CONFIG,
  type KeyboardHandlers,
} from '@/lib/fabric-helpers'

// ============================================================================
// Types
// ============================================================================

export interface LabelCanvasRef {
  exportToDataURL: () => string | null
  zoomIn: () => void
  zoomOut: () => void
  setZoom: (zoom: number) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  selectAll: () => void
  deselectAll: () => void
}

interface LabelCanvasProps {
  elements: LabelElement[]
  labelSize: LabelSize
  product?: Product | null
  config?: Partial<CanvasConfig>
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<LabelElement>) => void
  onElementsChange: (elements: LabelElement[]) => void
  onConfigChange?: (config: CanvasConfig) => void
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  className?: string
}

// Selection colors
const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'
const SELECTION_BORDER_COLOR = '#3b82f6'
const CORNER_COLOR = '#3b82f6'

// ============================================================================
// Component
// ============================================================================

const LabelCanvas = forwardRef<LabelCanvasRef, LabelCanvasProps>(({
  elements,
  labelSize,
  product = null,
  config: configProp,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onElementsChange,
  onConfigChange,
  onHistoryChange,
  className,
}, ref) => {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const undoManagerRef = useRef(new UndoRedoManager())
  const renderingRef = useRef(false)
  const clipboardRef = useRef<LabelElement | null>(null)
  const elementsRef = useRef(elements)

  // Keep elements ref updated
  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  // State
  const [config, setConfig] = useState<CanvasConfig>({ ...DEFAULT_CANVAS_CONFIG, ...configProp })

  // Canvas dimensions
  const padding = 40
  const labelWidthPx = mmToPx(labelSize.width) * config.zoom
  const labelHeightPx = mmToPx(labelSize.height) * config.zoom
  const canvasWidth = labelWidthPx + padding * 2
  const canvasHeight = labelHeightPx + padding * 2

  // Update config when prop changes
  useEffect(() => {
    if (configProp) {
      setConfig(prev => ({ ...prev, ...configProp }))
    }
  }, [configProp])

  // Notify parent of history changes
  const notifyHistoryChange = useCallback(() => {
    onHistoryChange?.(
      undoManagerRef.current.canUndo(),
      undoManagerRef.current.canRedo()
    )
  }, [onHistoryChange])

  // Save state to history
  const saveToHistory = useCallback(() => {
    if (!undoManagerRef.current.isRestoringState) {
      undoManagerRef.current.save(elementsRef.current)
      notifyHistoryChange()
    }
  }, [notifyHistoryChange])

  // ============================================================================
  // Canvas Initialization (only once)
  // ============================================================================

  useEffect(() => {
    const container = containerRef.current
    if (!container || canvasRef.current) return

    // Create canvas element
    const canvasEl = document.createElement('canvas')
    canvasEl.id = `label-canvas-${Date.now()}`
    container.appendChild(canvasEl)

    // Initialize Fabric canvas
    const canvas = new Canvas(canvasEl, {
      width: canvasWidth,
      height: canvasHeight,
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

    canvasRef.current = canvas

    // Initialize history
    undoManagerRef.current.init(elements)
    notifyHistoryChange()

    return () => {
      canvas.dispose()
      canvasRef.current = null
    }
  }, []) // Only run once on mount

  // ============================================================================
  // Canvas Event Handlers (update when callbacks change)
  // ============================================================================

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Mouse down on canvas - for selection
    const handleMouseDown = (e: any) => {
      if (e.target) {
        const data = getElementData(e.target)
        if (data && !data.isBackground) {
          onSelectElement(data.elementId)
        }
      } else {
        onSelectElement(null)
      }
    }

    // Object modified
    const handleObjectModified = (e: any) => {
      const obj = e.target
      if (!obj) return
      const data = getElementData(obj)
      if (!data || data.isBackground) return

      if (config.snapToGrid) {
        snapObjectToGrid(obj, config.gridSize, config.zoom, true, padding, padding)
        canvas.renderAll()
      }

      const pos = fabricToMm(obj, config.zoom, padding, padding)
      onUpdateElement(data.elementId, pos)
      saveToHistory()
    }

    // Object moving
    const handleObjectMoving = (e: any) => {
      const obj = e.target
      if (!obj) return
      const data = getElementData(obj)
      if (data?.isBackground) return

      if (config.snapToGrid) {
        snapObjectToGrid(obj, config.gridSize, config.zoom, true, padding, padding)
      }

      const left = obj.left ?? 0
      const top = obj.top ?? 0
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1)
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1)

      obj.set({
        left: Math.max(padding, Math.min(padding + labelWidthPx - width, left)),
        top: Math.max(padding, Math.min(padding + labelHeightPx - height, top)),
      })
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('object:modified', handleObjectModified)
    canvas.on('object:moving', handleObjectMoving)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('object:modified', handleObjectModified)
      canvas.off('object:moving', handleObjectMoving)
    }
  }, [config.snapToGrid, config.gridSize, config.zoom, labelWidthPx, labelHeightPx, onSelectElement, onUpdateElement, saveToHistory])

  // ============================================================================
  // Render Elements when they change
  // ============================================================================

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || renderingRef.current) return

    const renderElements = async () => {
      renderingRef.current = true

      // Clear all objects
      canvas.clear()
      canvas.backgroundColor = '#f5f5f5'

      // Draw label background (white rectangle)
      const background = new Rect({
        left: padding,
        top: padding,
        width: labelWidthPx,
        height: labelHeightPx,
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
      })
      setElementData(background, { elementId: '__bg__', elementType: 'customText', isBackground: true })
      canvas.add(background)

      // Draw grid lines on the label
      if (config.gridEnabled) {
        const gridSizePx = mmToPx(config.gridSize) * config.zoom
        
        // Vertical lines
        for (let x = padding + gridSizePx; x < padding + labelWidthPx; x += gridSizePx) {
          const line = new Rect({
            left: x,
            top: padding,
            width: 0.5,
            height: labelHeightPx,
            fill: '#e5e7eb',
            selectable: false,
            evented: false,
          })
          setElementData(line, { elementId: '__grid__', elementType: 'customText', isBackground: true })
          canvas.add(line)
        }

        // Horizontal lines
        for (let y = padding + gridSizePx; y < padding + labelHeightPx; y += gridSizePx) {
          const line = new Rect({
            left: padding,
            top: y,
            width: labelWidthPx,
            height: 0.5,
            fill: '#e5e7eb',
            selectable: false,
            evented: false,
          })
          setElementData(line, { elementId: '__grid__', elementType: 'customText', isBackground: true })
          canvas.add(line)
        }
      }

      // Create elements
      const enabledElements = elements.filter(e => e.enabled)
      
      for (const element of enabledElements) {
        const fabricObj = await createFabricElement({
          element,
          product,
          zoom: config.zoom,
          offsetX: padding,
          offsetY: padding,
        })

        if (fabricObj) {
          canvas.add(fabricObj)

          // Select if this is the selected element
          if (element.id === selectedElementId) {
            canvas.setActiveObject(fabricObj)
          }
        }
      }

      canvas.renderAll()
      renderingRef.current = false
    }

    renderElements()
  }, [elements, labelSize, product, config.zoom, config.gridEnabled, config.gridSize, selectedElementId, labelWidthPx, labelHeightPx])

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handlers: KeyboardHandlers = {
      onDelete: () => {
        if (selectedElementId) {
          const newElements = elementsRef.current.filter(e => e.id !== selectedElementId)
          onElementsChange(newElements)
          onSelectElement(null)
          saveToHistory()
        }
      },
      onCopy: () => {
        const el = elementsRef.current.find(e => e.id === selectedElementId)
        if (el) clipboardRef.current = { ...el }
      },
      onPaste: () => {
        if (clipboardRef.current) {
          const newEl: LabelElement = {
            ...clipboardRef.current,
            id: `${clipboardRef.current.type}-${Date.now()}`,
            x: clipboardRef.current.x + 5,
            y: clipboardRef.current.y + 5,
          }
          onElementsChange([...elementsRef.current, newEl])
          onSelectElement(newEl.id)
          saveToHistory()
        }
      },
      onDuplicate: () => {
        const el = elementsRef.current.find(e => e.id === selectedElementId)
        if (el) {
          const newEl: LabelElement = {
            ...el,
            id: `${el.type}-${Date.now()}`,
            x: el.x + 5,
            y: el.y + 5,
          }
          onElementsChange([...elementsRef.current, newEl])
          onSelectElement(newEl.id)
          saveToHistory()
        }
      },
      onUndo: () => {
        const state = undoManagerRef.current.undo()
        if (state) {
          onElementsChange(state)
          notifyHistoryChange()
        }
      },
      onRedo: () => {
        const state = undoManagerRef.current.redo()
        if (state) {
          onElementsChange(state)
          notifyHistoryChange()
        }
      },
      onSelectAll: () => {
        const canvas = canvasRef.current
        if (canvas) {
          const objs = canvas.getObjects().filter(o => {
            const d = getElementData(o)
            return d && !d.isBackground
          })
          if (objs.length > 0) {
            canvas.setActiveObject(objs[0])
            canvas.renderAll()
          }
        }
      },
      onDeselect: () => {
        canvasRef.current?.discardActiveObject()
        canvasRef.current?.renderAll()
        onSelectElement(null)
      },
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      handleKeyboardShortcut(e, handlers)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElementId, onElementsChange, onSelectElement, saveToHistory, notifyHistoryChange])

  // ============================================================================
  // Imperative API
  // ============================================================================

  useImperativeHandle(ref, () => ({
    exportToDataURL: () => canvasRef.current?.toDataURL({ format: 'png', multiplier: 2 }) || null,
    zoomIn: () => {
      const newZoom = getNextZoomLevel(config.zoom, 'in')
      setConfig(prev => {
        const updated = { ...prev, zoom: newZoom }
        onConfigChange?.(updated)
        return updated
      })
    },
    zoomOut: () => {
      const newZoom = getNextZoomLevel(config.zoom, 'out')
      setConfig(prev => {
        const updated = { ...prev, zoom: newZoom }
        onConfigChange?.(updated)
        return updated
      })
    },
    setZoom: (zoom: number) => {
      const clamped = Math.max(0.25, Math.min(4, zoom))
      setConfig(prev => {
        const updated = { ...prev, zoom: clamped }
        onConfigChange?.(updated)
        return updated
      })
    },
    undo: () => {
      const state = undoManagerRef.current.undo()
      if (state) {
        onElementsChange(state)
        notifyHistoryChange()
      }
    },
    redo: () => {
      const state = undoManagerRef.current.redo()
      if (state) {
        onElementsChange(state)
        notifyHistoryChange()
      }
    },
    canUndo: () => undoManagerRef.current.canUndo(),
    canRedo: () => undoManagerRef.current.canRedo(),
    selectAll: () => {
      const canvas = canvasRef.current
      if (canvas) {
        const objs = canvas.getObjects().filter(o => {
          const d = getElementData(o)
          return d && !d.isBackground
        })
        if (objs.length > 0) {
          canvas.setActiveObject(objs[0])
          canvas.renderAll()
        }
      }
    },
    deselectAll: () => {
      canvasRef.current?.discardActiveObject()
      canvasRef.current?.renderAll()
      onSelectElement(null)
    },
  }))

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={`relative ${className || ''}`}>
      {/* Rulers */}
      {config.showRulers && (
        <>
          {/* Top Ruler */}
          <div className="flex">
            <div className="w-6 h-5 bg-gray-100 border-r border-b border-gray-300" />
            <div 
              className="h-5 bg-gray-100 border-b border-gray-300 relative overflow-hidden"
              style={{ width: canvasWidth }}
            >
              {Array.from({ length: Math.ceil(labelSize.width / 10) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute text-[9px] text-gray-500 font-mono"
                  style={{ left: padding + mmToPx(i * 10) * config.zoom - 8 }}
                >
                  {i * 10}
                </div>
              ))}
            </div>
          </div>
          
          {/* Left Ruler + Canvas */}
          <div className="flex">
            <div 
              className="w-6 bg-gray-100 border-r border-gray-300 relative overflow-hidden flex-shrink-0"
              style={{ height: canvasHeight }}
            >
              {Array.from({ length: Math.ceil(labelSize.height / 10) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute text-[9px] text-gray-500 font-mono"
                  style={{ top: padding + mmToPx(i * 10) * config.zoom - 6, left: 2 }}
                >
                  {i * 10}
                </div>
              ))}
            </div>
            
            {/* Canvas Container */}
            <div 
              ref={containerRef}
              className="overflow-auto border border-gray-300 rounded-r"
              style={{ maxHeight: '450px' }}
            />
          </div>
        </>
      )}

      {/* No rulers */}
      {!config.showRulers && (
        <div 
          ref={containerRef}
          className="overflow-auto border border-gray-300 rounded"
          style={{ maxHeight: '450px' }}
        />
      )}
    </div>
  )
})

LabelCanvas.displayName = 'LabelCanvas'

export default LabelCanvas
