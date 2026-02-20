import { Button, Separator, Badge, Switch, Label } from '@/components/ui'
import {
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Magnet,
  Ruler,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Download,
  RotateCcw,
} from 'lucide-react'
import type { CanvasConfig } from '@/lib/fabric-helpers'
import { ZOOM_LEVELS } from '@/lib/fabric-helpers'

interface CanvasToolbarProps {
  config: CanvasConfig
  onConfigChange: (config: Partial<CanvasConfig>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
  onReset: () => void
  hasSelection: boolean
}

export default function CanvasToolbar({
  config,
  onConfigChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
  onExport,
  onReset,
  hasSelection,
}: CanvasToolbarProps) {
  const zoomPercent = Math.round(config.zoom * 100)

  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(z => z >= config.zoom)
    const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1)
    onConfigChange({ zoom: ZOOM_LEVELS[nextIndex] })
  }

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(z => z >= config.zoom)
    const prevIndex = Math.max(currentIndex - 1, 0)
    onConfigChange({ zoom: ZOOM_LEVELS[prevIndex] })
  }

  const handleZoomReset = () => {
    onConfigChange({ zoom: 1 })
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomOut}
          disabled={config.zoom <= ZOOM_LEVELS[0]}
          title="Zoom Out (Ctrl+-)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-8 min-w-[60px] font-mono text-xs"
          onClick={handleZoomReset}
          title="Reset Zoom"
        >
          {zoomPercent}%
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomIn}
          disabled={config.zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          title="Zoom In (Ctrl++)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Grid & Snap Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant={config.gridEnabled ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => onConfigChange({ gridEnabled: !config.gridEnabled })}
          title="Toggle Grid"
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
        
        <Button
          variant={config.snapToGrid ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => onConfigChange({ snapToGrid: !config.snapToGrid })}
          title="Snap to Grid"
          disabled={!config.gridEnabled}
        >
          <Magnet className="h-4 w-4" />
        </Button>
        
        <Button
          variant={config.showRulers ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => onConfigChange({ showRulers: !config.showRulers })}
          title="Toggle Rulers"
        >
          <Ruler className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Selection Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onDuplicate}
          disabled={!hasSelection}
          title="Duplicate (Ctrl+D)"
        >
          <Copy className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={!hasSelection}
          title="Delete (Del)"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Export & Reset */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onExport}
          title="Export Image"
        >
          <Download className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onReset}
          title="Reset Canvas"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Status */}
      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {hasSelection && (
          <Badge variant="outline" className="text-xs">
            Selected
          </Badge>
        )}
        <span>Grid: {config.gridSize}mm</span>
      </div>
    </div>
  )
}

// Compact version for smaller screens
export function CanvasToolbarCompact({
  config,
  onConfigChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Pick<CanvasToolbarProps, 'config' | 'onConfigChange' | 'canUndo' | 'canRedo' | 'onUndo' | 'onRedo'>) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onConfigChange({ zoom: Math.max(0.25, config.zoom / 1.25) })}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-mono w-10 text-center">{Math.round(config.zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onConfigChange({ zoom: Math.min(4, config.zoom * 1.25) })}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-5" />
      
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUndo} disabled={!canUndo}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRedo} disabled={!canRedo}>
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
