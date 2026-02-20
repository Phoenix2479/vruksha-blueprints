import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBarcodeStore } from '@/store/barcodeStore'
import type { LabelTemplate, TemplateCategory } from '@/types/barcode'
import { ELEMENT_TYPE_INFO, TEMPLATE_CATEGORIES } from '@/types/barcode'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import {
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
} from '@/components/blocks'
import {
  Plus,
  FileText,
  Printer,
  Edit2,
  Trash2,
  Copy,
  MoreVertical,
  Layers,
  Barcode,
  Calendar,
  Star,
  StarOff,
  Download,
  Upload,
  Filter,
  Tag,
  Package,
  LayoutGrid,
  Truck,
  Gem,
  Shirt,
  TrendingUp,
} from 'lucide-react'
import TemplateFormModal from '@/components/modals/TemplateFormModal'
import ImportTemplateModal from '@/components/modals/ImportTemplateModal'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Tag, Package, LayoutGrid, Truck, Gem, Shirt,
}

export default function TemplatesTab() {
  const queryClient = useQueryClient()
  const {
    showTemplateForm,
    editingTemplate,
    duplicateTemplate,
    deleteConfirm,
    openNewTemplateForm,
    openEditTemplateForm,
    openDuplicateTemplateForm,
    closeTemplateForm,
    openDeleteConfirm,
    closeDeleteConfirm,
    setActiveTab,
  } = useBarcodeStore()

  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<string>('updated_at')
  const [showImportModal, setShowImportModal] = useState(false)

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', categoryFilter, showFavoritesOnly, sortBy],
    queryFn: () => api.get('/api/templates', {
      params: {
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        favorites_only: showFavoritesOnly ? 'true' : undefined,
        sort: sortBy,
      }
    }).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      closeDeleteConfirm()
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/templates/${id}/favorite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const templates: LabelTemplate[] = templatesData?.templates || []

  const handleExport = async (template: LabelTemplate) => {
    try {
      const response = await api.get(`/api/templates/${template.id}/export`, {
        responseType: 'blob'
      })
      const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${template.name.replace(/[^a-z0-9]/gi, '_')}_template.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  if (isLoading) {
    return <LoadingSpinner size="lg" text="Loading templates..." />
  }

  // Get the template to use in form (either editing or duplicating)
  const formTemplate = editingTemplate || (duplicateTemplate ? {
    ...duplicateTemplate,
    id: '', // Clear ID for duplication
    name: `${duplicateTemplate.name} (Copy)`,
  } as LabelTemplate : null)

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Label Templates</h2>
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={openNewTemplateForm}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category Tabs */}
        <Tabs value={categoryFilter} onValueChange={setCategoryFilter} className="flex-1">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs px-3">All</TabsTrigger>
            {TEMPLATE_CATEGORIES.map(cat => {
              const Icon = CATEGORY_ICONS[cat.icon] || Tag
              return (
                <TabsTrigger key={cat.value} value={cat.value} className="text-xs px-3">
                  <Icon className="h-3 w-3 mr-1" />
                  {cat.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {/* Favorites Toggle */}
        <Button
          variant={showFavoritesOnly ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          <Star className={`h-4 w-4 mr-1 ${showFavoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          Favorites
        </Button>

        {/* Sort */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at">Recently Updated</SelectItem>
            <SelectItem value="created_at">Recently Created</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="usage">Most Used</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={showFavoritesOnly ? "No favorite templates" : categoryFilter !== 'all' ? `No ${categoryFilter} templates` : "No templates yet"}
          description={showFavoritesOnly ? "Mark templates as favorites to see them here" : "Create your first label template to start designing and printing product labels"}
          action={!showFavoritesOnly && categoryFilter === 'all' ? {
            label: 'Create Template',
            onClick: openNewTemplateForm,
            icon: Plus,
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => openEditTemplateForm(template)}
              onDuplicate={() => openDuplicateTemplateForm(template)}
              onDelete={() => openDeleteConfirm(template)}
              onExport={() => handleExport(template)}
              onToggleFavorite={() => favoriteMutation.mutate(template.id)}
              onUse={() => setActiveTab('products')}
            />
          ))}
        </div>
      )}

      {/* Template Form Modal */}
      {showTemplateForm && (
        <TemplateFormModal
          template={editingTemplate}
          onClose={closeTemplateForm}
        />
      )}

      {/* Import Modal */}
      <ImportTemplateModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          if (!open) closeDeleteConfirm()
        }}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteConfirm.template?.name}"? This action cannot be undone. Any print history using this template will show "Deleted Template".`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteConfirm.template) {
            deleteMutation.mutate(deleteConfirm.template.id)
          }
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

interface TemplateCardProps {
  template: LabelTemplate
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: () => void
  onToggleFavorite: () => void
  onUse: () => void
}

function TemplateCard({ template, onEdit, onDuplicate, onDelete, onExport, onToggleFavorite, onUse }: TemplateCardProps) {
  // Count enabled elements by type
  const enabledElements = template.elements?.filter(e => e.enabled) || []
  const hasBarcode = enabledElements.some(e => e.type === 'barcode')
  const hasPrice = enabledElements.some(e => e.type === 'price' || e.type === 'mrp')
  
  // Format date
  const updatedDate = new Date(template.updatedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  // Category info
  const categoryInfo = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
  const CategoryIcon = categoryInfo ? (CATEGORY_ICONS[categoryInfo.icon] || Tag) : Tag

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base truncate">{template.name}</CardTitle>
              {template.isFavorite && (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                {template.size.width}×{template.size.height}mm
              </span>
              {template.category && template.category !== 'general' && (
                <Badge variant="outline" className="text-xs">
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryInfo?.label}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleFavorite}>
                {template.isFavorite ? (
                  <>
                    <StarOff className="h-4 w-4 mr-2" />
                    Remove from Favorites
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" />
                    Add to Favorites
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        {template.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        )}

        {/* Element summary */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">
            <Layers className="h-3 w-3 mr-1" />
            {enabledElements.length} elements
          </Badge>
          {hasBarcode && (
            <Badge variant="outline" className="text-xs">
              <Barcode className="h-3 w-3 mr-1" />
              Barcode
            </Badge>
          )}
          {hasPrice && (
            <Badge variant="outline" className="text-xs">
              Price
            </Badge>
          )}
        </div>

        {/* Mini preview of elements */}
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {enabledElements.slice(0, 5).map(el => (
            <span key={el.id} className="bg-muted px-1.5 py-0.5 rounded">
              {ELEMENT_TYPE_INFO[el.type]?.label || el.type}
            </span>
          ))}
          {enabledElements.length > 5 && (
            <span className="bg-muted px-1.5 py-0.5 rounded">
              +{enabledElements.length - 5} more
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              {updatedDate}
            </span>
            {(template.usageCount || 0) > 0 && (
              <span className="flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                {template.usageCount} prints
              </span>
            )}
          </div>
          <Button size="sm" onClick={onUse}>
            <Printer className="h-4 w-4 mr-2" />
            Use
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
