import { useState, useCallback, useRef } from 'react'
import type { LabelElement, LabelSize, LabelElementType, BarcodeType, Product } from '@/types/barcode'
import {
  ELEMENT_TYPE_INFO,
  BARCODE_TYPES,
  FONT_FAMILIES,
  DEFAULT_FONT,
  createDefaultElement,
} from '@/types/barcode'
import LabelCanvas, { type LabelCanvasRef } from './LabelCanvas'
import CanvasToolbar from './CanvasToolbar'
import { DEFAULT_CANVAS_CONFIG, type CanvasConfig } from '@/lib/fabric-helpers'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  ScrollArea,
  Badge,
} from '@/components/ui'
import {
  Barcode,
  Type,
  IndianRupee,
  Tag,
  Hash,
  Package,
  Calendar,
  Scale,
  TextCursor,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Settings2,
  Layers,
  Palette,
} from 'lucide-react'

const ICONS: Record<string, React.ElementType> = {
  Barcode, Type, IndianRupee, Tag, Hash, Package, Calendar, Scale, TextCursor,
}

export type MeasurementUnit = 'mm' | 'cm'

// Unit conversion helpers
const mmToCm = (mm: number) => Math.round(mm / 10 * 100) / 100
const cmToMm = (cm: number) => Math.round(cm * 10)
const convertToDisplay = (mm: number, unit: MeasurementUnit) => unit === 'cm' ? mmToCm(mm) : mm
const convertFromDisplay = (value: number, unit: MeasurementUnit) => unit === 'cm' ? cmToMm(value) : value

interface LabelDesignerProps {
  elements: LabelElement[]
  labelSize: LabelSize
  product?: Product | null
  unit?: MeasurementUnit
  onUnitChange?: (unit: MeasurementUnit) => void
  onChange: (elements: LabelElement[]) => void
}

export default function LabelDesigner({ elements, labelSize, product = null, unit = 'mm', onUnitChange, onChange }: LabelDesignerProps) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS_CONFIG)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const canvasRef = useRef<LabelCanvasRef>(null)
  // Local unit state if not controlled
  const [localUnit, setLocalUnit] = useState<MeasurementUnit>(unit)
  const currentUnit = onUnitChange ? unit : localUnit
  const handleUnitChange = (newUnit: MeasurementUnit) => {
    if (onUnitChange) {
      onUnitChange(newUnit)
    } else {
      setLocalUnit(newUnit)
    }
  }

  const selectedElement = elements.find(e => e.id === selectedElementId)

  const addElement = useCallback((type: LabelElementType) => {
    const newElement = createDefaultElement(type, elements.length)
    onChange([...elements, newElement])
    setSelectedElementId(newElement.id)
  }, [elements, onChange])

  const updateElement = useCallback((id: string, updates: Partial<LabelElement>) => {
    onChange(elements.map(e => e.id === id ? { ...e, ...updates } : e))
  }, [elements, onChange])

  const removeElement = useCallback((id: string) => {
    onChange(elements.filter(e => e.id !== id))
    if (selectedElementId === id) setSelectedElementId(null)
  }, [elements, onChange, selectedElementId])

  const moveElement = useCallback((id: string, direction: 'up' | 'down') => {
    const index = elements.findIndex(e => e.id === id)
    if (index === -1) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= elements.length) return
    
    const newElements = [...elements]
    const [removed] = newElements.splice(index, 1)
    newElements.splice(newIndex, 0, removed)
    onChange(newElements.map((e, i) => ({ ...e, order: i })))
  }, [elements, onChange])

  const toggleElement = useCallback((id: string) => {
    const element = elements.find(e => e.id === id)
    if (element) {
      updateElement(id, { enabled: !element.enabled })
    }
  }, [elements, updateElement])

  const duplicateElement = useCallback((id: string) => {
    const element = elements.find(e => e.id === id)
    if (element) {
      const newElement: LabelElement = {
        ...element,
        id: `${element.type}-${Date.now()}`,
        x: element.x + 5,
        y: element.y + 5,
        order: elements.length,
      }
      onChange([...elements, newElement])
      setSelectedElementId(newElement.id)
    }
  }, [elements, onChange])

  const handleCanvasConfigChange = (config: Partial<CanvasConfig>) => {
    setCanvasConfig(prev => ({ ...prev, ...config }))
  }

  const handleExport = () => {
    const dataUrl = canvasRef.current?.exportToDataURL()
    if (dataUrl) {
      const link = document.createElement('a')
      link.download = 'label-preview.png'
      link.href = dataUrl
      link.click()
    }
  }

  const handleReset = () => {
    setCanvasConfig(DEFAULT_CANVAS_CONFIG)
  }

  return (
    <div className="space-y-4">
      {/* Canvas Toolbar */}
      <CanvasToolbar
        config={canvasConfig}
        onConfigChange={handleCanvasConfigChange}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onDelete={() => selectedElementId && removeElement(selectedElementId)}
        onDuplicate={() => selectedElementId && duplicateElement(selectedElementId)}
        onExport={handleExport}
        onReset={handleReset}
        hasSelection={!!selectedElementId}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Panel - Element List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Label Elements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Add Element Dropdown */}
              <Select onValueChange={(v) => addElement(v as LabelElementType)}>
                <SelectTrigger className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Add element..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ELEMENT_TYPE_INFO) as LabelElementType[]).map(type => {
                    const info = ELEMENT_TYPE_INFO[type]
                    const Icon = ICONS[info.icon] || Type
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{info.label}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              <Separator className="my-3" />

              {/* Element List */}
              <ScrollArea className="h-[250px]">
                {elements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No elements added yet
                  </p>
                ) : (
                  <div className="space-y-1">
                    {elements.map((element, index) => {
                      const info = ELEMENT_TYPE_INFO[element.type]
                      const Icon = ICONS[info.icon] || Type
                      const isSelected = selectedElementId === element.id
                      
                      return (
                        <div
                          key={element.id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                          } ${!element.enabled ? 'opacity-50' : ''}`}
                          onClick={() => setSelectedElementId(element.id)}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Icon className="h-4 w-4" />
                          <span className="flex-1 text-sm truncate">{info.label}</span>
                          
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); toggleElement(element.id) }}
                            >
                              {element.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={index === 0}
                              onClick={(e) => { e.stopPropagation(); moveElement(element.id, 'up') }}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={index === elements.length - 1}
                              onClick={(e) => { e.stopPropagation(); moveElement(element.id, 'down') }}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeElement(element.id) }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Middle Panel - Canvas */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Label Canvas
                </span>
                <Badge variant="outline">
                  {labelSize.width}×{labelSize.height}mm
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LabelCanvas
                ref={canvasRef}
                elements={elements}
                labelSize={labelSize}
                product={product}
                config={canvasConfig}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElement={updateElement}
                onElementsChange={onChange}
                onConfigChange={setCanvasConfig}
                onHistoryChange={(undo, redo) => {
                  setCanUndo(undo)
                  setCanRedo(redo)
                }}
                className="min-h-[350px]"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Element Properties */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Properties
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedElement ? (
                <ElementPropertiesPanel
                  element={selectedElement}
                  unit={currentUnit}
                  onUnitChange={handleUnitChange}
                  onChange={(updates) => updateElement(selectedElement.id, updates)}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select an element to edit its properties
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Element Properties Panel
interface ElementPropertiesPanelProps {
  element: LabelElement
  unit: MeasurementUnit
  onUnitChange: (unit: MeasurementUnit) => void
  onChange: (updates: Partial<LabelElement>) => void
}

function ElementPropertiesPanel({ element, unit, onUnitChange, onChange }: ElementPropertiesPanelProps) {
  const info = ELEMENT_TYPE_INFO[element.type]

  return (
    <ScrollArea className="h-[350px] pr-4">
      <div className="space-y-4">
        {/* Element Type Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{info.label}</Badge>
          <span className="text-xs text-muted-foreground">{info.description}</span>
        </div>

        <Separator />

        {/* Unit Toggle */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Unit</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={unit === 'mm' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onUnitChange('mm')}
              className="flex-1 h-7 text-xs"
            >
              mm
            </Button>
            <Button
              type="button"
              variant={unit === 'cm' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onUnitChange('cm')}
              className="flex-1 h-7 text-xs"
            >
              cm
            </Button>
          </div>
        </div>

        <Separator />

        {/* Position */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Position</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">X ({unit})</Label>
              <Input
                type="number"
                value={convertToDisplay(element.x, unit)}
                onChange={(e) => onChange({ x: convertFromDisplay(Number(e.target.value), unit) })}
                min={0}
                step={unit === 'cm' ? 0.1 : 1}
              />
            </div>
            <div>
              <Label className="text-xs">Y ({unit})</Label>
              <Input
                type="number"
                value={convertToDisplay(element.y, unit)}
                onChange={(e) => onChange({ y: convertFromDisplay(Number(e.target.value), unit) })}
                min={0}
                step={unit === 'cm' ? 0.1 : 1}
              />
            </div>
          </div>
        </div>

        {/* Size (for barcode) */}
        {element.type === 'barcode' && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Size</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width ({unit})</Label>
                <Input
                  type="number"
                  value={convertToDisplay(element.width || 40, unit)}
                  onChange={(e) => onChange({ width: convertFromDisplay(Number(e.target.value), unit) })}
                  min={unit === 'cm' ? 1 : 10}
                  max={unit === 'cm' ? 10 : 100}
                  step={unit === 'cm' ? 0.1 : 1}
                />
              </div>
              <div>
                <Label className="text-xs">Height ({unit})</Label>
                <Input
                  type="number"
                  value={convertToDisplay(element.height || 15, unit)}
                  onChange={(e) => onChange({ height: convertFromDisplay(Number(e.target.value), unit) })}
                  min={unit === 'cm' ? 0.5 : 5}
                  max={unit === 'cm' ? 5 : 50}
                  step={unit === 'cm' ? 0.1 : 1}
                />
              </div>
            </div>
          </div>
        )}

        {/* Barcode Type */}
        {element.type === 'barcode' && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Barcode Type</Label>
            <Select
              value={element.barcodeType || 'code128'}
              onValueChange={(v) => onChange({ barcodeType: v as BarcodeType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_TYPES.map(bt => (
                  <SelectItem key={bt.value} value={bt.value}>
                    <div>
                      <div>{bt.label}</div>
                      <div className="text-xs text-muted-foreground">{bt.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Font Settings (for text elements) */}
        {element.type !== 'barcode' && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Font</Label>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Family</Label>
                <Select
                  value={element.font?.family || 'Arial'}
                  onValueChange={(v) => onChange({ font: { ...element.font || DEFAULT_FONT, family: v } })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map(f => (
                      <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Size (pt)</Label>
                <Input
                  type="number"
                  value={element.font?.size || 12}
                  onChange={(e) => onChange({ font: { ...element.font || DEFAULT_FONT, size: Number(e.target.value) } })}
                  min={6}
                  max={72}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={element.font?.bold || false}
                    onCheckedChange={(v) => onChange({ font: { ...element.font || DEFAULT_FONT, bold: v } })}
                  />
                  <Label className="text-xs font-bold">Bold</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={element.font?.italic || false}
                    onCheckedChange={(v) => onChange({ font: { ...element.font || DEFAULT_FONT, italic: v } })}
                  />
                  <Label className="text-xs italic">Italic</Label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Currency Symbol (for price/mrp) */}
        {(element.type === 'price' || element.type === 'mrp') && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Currency</Label>
            <Select
              value={element.currencySymbol || '₹'}
              onValueChange={(v) => onChange({ currencySymbol: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="₹">₹ (INR)</SelectItem>
                <SelectItem value="$">$ (USD)</SelectItem>
                <SelectItem value="€">€ (EUR)</SelectItem>
                <SelectItem value="£">£ (GBP)</SelectItem>
                <SelectItem value="¥">¥ (JPY/CNY)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Prefix/Suffix */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Text Format</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Prefix</Label>
              <Input
                value={element.prefix || ''}
                onChange={(e) => onChange({ prefix: e.target.value })}
                placeholder="e.g., MRP: "
              />
            </div>
            <div>
              <Label className="text-xs">Suffix</Label>
              <Input
                value={element.suffix || ''}
                onChange={(e) => onChange({ suffix: e.target.value })}
                placeholder="e.g., /kg"
              />
            </div>
          </div>
        </div>

        {/* Custom Text Value */}
        {element.type === 'customText' && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Text Value</Label>
            <Input
              value={element.value || ''}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Enter custom text..."
            />
          </div>
        )}

        {/* Visibility Toggle */}
        <Separator />
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show on label</Label>
          <Switch
            checked={element.enabled}
            onCheckedChange={(v) => onChange({ enabled: v })}
          />
        </div>
      </div>
    </ScrollArea>
  )
}
