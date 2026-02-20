import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LabelTemplate, LabelElement, LabelSize, TemplateCategory } from '@/types/barcode'
import { PREDEFINED_LABEL_SIZES, TEMPLATE_CATEGORIES, createDefaultElement } from '@/types/barcode'
import LabelDesigner from '@/components/designer/LabelDesigner'
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Badge,
  ScrollArea,
} from '@shared/components/ui'
import { 
  Loader2, 
  Settings, 
  Palette, 
  Save, 
  CheckCircle2, 
  ChevronRight,
  FileText,
  Layers,
  Eye,
} from 'lucide-react'

interface TemplateFormModalProps {
  template: LabelTemplate | null
  onClose: () => void
}

type TabId = 'info' | 'design' | 'review'

interface TabItem {
  id: TabId
  label: string
  icon: React.ElementType
  description: string
}

const TABS: TabItem[] = [
  { id: 'info', label: 'Info & Size', icon: Settings, description: 'Basic settings' },
  { id: 'design', label: 'Design', icon: Palette, description: 'Layout elements' },
  { id: 'review', label: 'Review', icon: Eye, description: 'Preview & save' },
]

type MeasurementUnit = 'mm' | 'cm'

// Unit conversion helpers
const mmToCm = (mm: number) => Math.round(mm / 10 * 100) / 100
const cmToMm = (cm: number) => Math.round(cm * 10)

export default function TemplateFormModal({ template, onClose }: TemplateFormModalProps) {
  const queryClient = useQueryClient()
  const isEditing = !!template

  // Basic info
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [category, setCategory] = useState<TemplateCategory>(template?.category || 'general')

  // Measurement unit preference
  const [unit, setUnit] = useState<MeasurementUnit>('mm')

  // Label size (always stored in mm internally)
  const [selectedSizeId, setSelectedSizeId] = useState<string>(() => {
    if (template?.size) {
      const match = PREDEFINED_LABEL_SIZES.find(
        s => s.width === template.size.width && s.height === template.size.height
      )
      return match?.id || 'custom'
    }
    return 'medium'
  })
  const [customWidth, setCustomWidth] = useState(template?.size?.width || 50)
  const [customHeight, setCustomHeight] = useState(template?.size?.height || 30)

  // Display values based on unit
  const displayWidth = unit === 'cm' ? mmToCm(customWidth) : customWidth
  const displayHeight = unit === 'cm' ? mmToCm(customHeight) : customHeight

  // Handle width change with unit conversion
  const handleWidthChange = (value: number) => {
    setCustomWidth(unit === 'cm' ? cmToMm(value) : value)
  }

  // Handle height change with unit conversion
  const handleHeightChange = (value: number) => {
    setCustomHeight(unit === 'cm' ? cmToMm(value) : value)
  }

  // Elements
  const [elements, setElements] = useState<LabelElement[]>(() => {
    if (template?.elements?.length) {
      return template.elements
    }
    return [
      createDefaultElement('barcode', 0),
      createDefaultElement('productName', 1),
      createDefaultElement('price', 2),
    ]
  })

  // Background SVG
  const [backgroundSvg, setBackgroundSvg] = useState(template?.backgroundSvg || '')

  // Current tab
  const [activeTab, setActiveTab] = useState<TabId>('info')

  // Track completed steps
  const [completedSteps, setCompletedSteps] = useState<Set<TabId>>(new Set())

  // Calculate current label size
  const currentLabelSize: LabelSize = (() => {
    if (selectedSizeId === 'custom') {
      return { id: 'custom', name: 'Custom', width: customWidth, height: customHeight, isCustom: true }
    }
    const preset = PREDEFINED_LABEL_SIZES.find(s => s.id === selectedSizeId)
    return preset || PREDEFINED_LABEL_SIZES[1]
  })()

  // Update custom dimensions when preset changes
  useEffect(() => {
    if (selectedSizeId !== 'custom') {
      const preset = PREDEFINED_LABEL_SIZES.find(s => s.id === selectedSizeId)
      if (preset) {
        setCustomWidth(preset.width)
        setCustomHeight(preset.height)
      }
    }
  }, [selectedSizeId])

  // Mark info step as complete when name is filled
  useEffect(() => {
    if (name.trim()) {
      setCompletedSteps(prev => new Set([...prev, 'info']))
    } else {
      setCompletedSteps(prev => {
        const next = new Set(prev)
        next.delete('info')
        return next
      })
    }
  }, [name])

  // Mark design step as complete when elements exist
  useEffect(() => {
    if (elements.filter(e => e.enabled).length > 0) {
      setCompletedSteps(prev => new Set([...prev, 'design']))
    }
  }, [elements])

  const mutation = useMutation({
    mutationFn: (data: object) =>
      isEditing
        ? api.put(`/api/templates/${template.id}`, data)
        : api.post('/api/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      onClose()
    },
  })

  const handleSubmit = () => {
    if (!name.trim()) return

    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      size: currentLabelSize,
      elements,
      backgroundSvg: backgroundSvg.trim() || undefined,
    })
  }

  const isValid = name.trim().length > 0 && elements.length > 0

  const goToTab = (tab: TabId) => setActiveTab(tab)

  const goNext = () => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab)
    if (currentIndex < TABS.length - 1) {
      setActiveTab(TABS[currentIndex + 1].id)
    }
  }

  const goPrev = () => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab)
    if (currentIndex > 0) {
      setActiveTab(TABS[currentIndex - 1].id)
    }
  }

  const currentTabIndex = TABS.findIndex(t => t.id === activeTab)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex h-[85vh]">
          {/* Left Sidebar - Vertical Tabs */}
          <div className="w-56 bg-muted/50 border-r flex flex-col">
            {/* Header */}
            <div className="p-4 border-b">
              <h2 className="font-semibold text-lg">
                {isEditing ? 'Edit Template' : 'New Template'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {isEditing ? 'Update settings & design' : 'Create label template'}
              </p>
            </div>

            {/* Tab List */}
            <nav className="flex-1 p-2 space-y-1">
              {TABS.map((tab, index) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                const isCompleted = completedSteps.has(tab.id)

                return (
                  <button
                    key={tab.id}
                    onClick={() => goToTab(tab.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all
                      ${isActive 
                        ? 'bg-background shadow-sm border border-border' 
                        : 'hover:bg-background/50'
                      }
                    `}
                  >
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                      ${isActive 
                        ? 'bg-primary text-primary-foreground' 
                        : isCompleted 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-muted text-muted-foreground'
                      }
                    `}>
                      {isCompleted && !isActive ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {tab.label}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {tab.description}
                      </div>
                    </div>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Footer info */}
            <div className="p-4 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Layers className="h-3 w-3" />
                <span>{elements.filter(e => e.enabled).length} elements</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <FileText className="h-3 w-3" />
                <span>{currentLabelSize.width}×{currentLabelSize.height}mm</span>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {/* Info & Size Tab */}
                {activeTab === 'info' && (
                  <div className="space-y-6 max-w-3xl">
                    <div>
                      <h3 className="text-lg font-semibold">Basic Information</h3>
                      <p className="text-sm text-muted-foreground">Configure template name, category, and label dimensions</p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column - Info */}
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium">Template Name *</Label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Standard Product Label"
                            maxLength={100}
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Description</Label>
                          <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description for this template..."
                            rows={3}
                            maxLength={500}
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Category</Label>
                          <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMPLATE_CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Right Column - Size */}
                      <div className="space-y-4">
                        {/* Unit Selector */}
                        <div>
                          <Label className="text-sm font-medium">Measurement Unit</Label>
                          <div className="flex gap-2 mt-1.5">
                            <Button
                              type="button"
                              variant={unit === 'mm' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setUnit('mm')}
                              className="flex-1"
                            >
                              Millimeters (mm)
                            </Button>
                            <Button
                              type="button"
                              variant={unit === 'cm' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setUnit('cm')}
                              className="flex-1"
                            >
                              Centimeters (cm)
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm font-medium">Label Size Preset</Label>
                          <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PREDEFINED_LABEL_SIZES.map(size => (
                                <SelectItem key={size.id} value={size.id}>
                                  {unit === 'cm' 
                                    ? `${size.name.split('(')[0].trim()} (${mmToCm(size.width)}×${mmToCm(size.height)}cm)`
                                    : size.name
                                  }
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedSizeId === 'custom' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm font-medium">Width ({unit})</Label>
                              <Input
                                type="number"
                                value={displayWidth}
                                onChange={(e) => handleWidthChange(Number(e.target.value))}
                                min={unit === 'cm' ? 1 : 10}
                                max={unit === 'cm' ? 30 : 300}
                                step={unit === 'cm' ? 0.1 : 1}
                                className="mt-1.5"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Height ({unit})</Label>
                              <Input
                                type="number"
                                value={displayHeight}
                                onChange={(e) => handleHeightChange(Number(e.target.value))}
                                min={unit === 'cm' ? 1 : 10}
                                max={unit === 'cm' ? 30 : 300}
                                step={unit === 'cm' ? 0.1 : 1}
                                className="mt-1.5"
                              />
                            </div>
                          </div>
                        )}

                        {/* Visual preview */}
                        <div className="p-4 bg-muted/50 rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-3">Size Preview</p>
                          <div className="flex items-center justify-center">
                            <div 
                              className="bg-white border-2 border-dashed border-gray-300 rounded"
                              style={{
                                width: Math.min(currentLabelSize.width * 2.5, 180),
                                height: Math.min(currentLabelSize.height * 2.5, 100),
                              }}
                            />
                          </div>
                          <p className="text-center text-sm mt-3 font-medium">
                            {unit === 'cm' 
                              ? `${mmToCm(currentLabelSize.width)} × ${mmToCm(currentLabelSize.height)} cm`
                              : `${currentLabelSize.width} × ${currentLabelSize.height} mm`
                            }
                          </p>
                          {unit === 'cm' && (
                            <p className="text-center text-xs text-muted-foreground mt-1">
                              ({currentLabelSize.width} × {currentLabelSize.height} mm)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Background SVG */}
                    <div className="space-y-2 pt-4">
                      <Label className="text-sm font-medium">Background SVG (Advanced)</Label>
                      <Textarea
                        value={backgroundSvg}
                        onChange={(e) => setBackgroundSvg(e.target.value)}
                        placeholder="Optional: Paste SVG code for custom background..."
                        rows={2}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Add borders, logos, or decorations using SVG code
                      </p>
                    </div>
                  </div>
                )}

                {/* Design Tab */}
                {activeTab === 'design' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">Label Designer</h3>
                      <p className="text-sm text-muted-foreground">Add and arrange elements on your label. Click on canvas or list to select.</p>
                    </div>

                    <Separator />

                    <LabelDesigner
                      elements={elements}
                      labelSize={currentLabelSize}
                      onChange={setElements}
                    />
                  </div>
                )}

                {/* Review Tab */}
                {activeTab === 'review' && (
                  <div className="space-y-6 max-w-3xl">
                    <div>
                      <h3 className="text-lg font-semibold">Review & Save</h3>
                      <p className="text-sm text-muted-foreground">Review your template settings before saving</p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Summary */}
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Template Details</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Name</span>
                            <span className="font-medium">{name || '(not set)'}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Category</span>
                            <Badge variant="secondary">{category}</Badge>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Label Size</span>
                            <span className="font-medium">{currentLabelSize.width} × {currentLabelSize.height} mm</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">Elements</span>
                            <span className="font-medium">{elements.filter(e => e.enabled).length} active</span>
                          </div>
                          {description && (
                            <div className="py-2">
                              <span className="text-muted-foreground block mb-1">Description</span>
                              <span className="text-sm">{description}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Elements List */}
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Label Elements</h4>
                        <div className="space-y-2">
                          {elements.map(el => (
                            <div 
                              key={el.id} 
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                el.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${el.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                                <span className="font-medium text-sm capitalize">
                                  {el.type.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {el.x}mm, {el.y}mm
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Validation */}
                    {!isValid && (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          Please ensure you have entered a template name and have at least one element.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t p-4 bg-background flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Step {currentTabIndex + 1} of {TABS.length}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                {currentTabIndex > 0 && (
                  <Button variant="outline" onClick={goPrev}>
                    Previous
                  </Button>
                )}
                {currentTabIndex < TABS.length - 1 ? (
                  <Button onClick={goNext}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={!isValid || mutation.isPending}>
                    {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    {isEditing ? 'Update Template' : 'Create Template'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
