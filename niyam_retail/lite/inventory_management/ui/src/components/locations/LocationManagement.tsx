import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MapPin, Plus, Search, Edit2, Trash2, ChevronRight, ChevronDown,
  X, Loader2, Warehouse, Store, Box, Package, Eye, Settings
} from 'lucide-react'
import { locationsApi } from '@/lib/api'
import { formatNumber, cn } from '@/lib/utils'
import type { Location, LocationInventory } from '@/types/inventory'

export default function LocationManagement() {
  const [showCreate, setShowCreate] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', typeFilter],
    queryFn: () => locationsApi.list({ type: typeFilter !== 'all' ? typeFilter : undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: locationsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })

  const filteredLocations = locations.filter((l: Location) =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Build tree structure
  const rootLocations = filteredLocations.filter((l: Location) => !l.parent_id)
  const childrenMap = new Map<string, Location[]>()
  filteredLocations.forEach((l: Location) => {
    if (l.parent_id) {
      const children = childrenMap.get(l.parent_id) || []
      children.push(l)
      childrenMap.set(l.parent_id, children)
    }
  })

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedLocations)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedLocations(newExpanded)
  }

  const locationTypeCounts = {
    warehouse: locations.filter((l: Location) => l.type === 'warehouse').length,
    store: locations.filter((l: Location) => l.type === 'store').length,
    zone: locations.filter((l: Location) => l.type === 'zone').length,
    bin: locations.filter((l: Location) => ['aisle', 'rack', 'shelf', 'bin'].includes(l.type)).length,
  }

  const typeIcons: Record<string, React.ReactNode> = {
    warehouse: <Warehouse className="h-4 w-4" />,
    store: <Store className="h-4 w-4" />,
    zone: <MapPin className="h-4 w-4" />,
    aisle: <Box className="h-4 w-4" />,
    rack: <Box className="h-4 w-4" />,
    shelf: <Box className="h-4 w-4" />,
    bin: <Package className="h-4 w-4" />,
  }

  const typeColors: Record<string, string> = {
    warehouse: 'bg-purple-100 text-purple-700',
    store: 'bg-blue-100 text-blue-700',
    zone: 'bg-green-100 text-green-700',
    aisle: 'bg-yellow-100 text-yellow-700',
    rack: 'bg-orange-100 text-orange-700',
    shelf: 'bg-pink-100 text-pink-700',
    bin: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Warehouses"
          count={locationTypeCounts.warehouse}
          icon={<Warehouse className="h-5 w-5 text-purple-500" />}
          active={typeFilter === 'warehouse'}
          onClick={() => setTypeFilter(typeFilter === 'warehouse' ? 'all' : 'warehouse')}
        />
        <StatCard
          label="Stores"
          count={locationTypeCounts.store}
          icon={<Store className="h-5 w-5 text-blue-500" />}
          active={typeFilter === 'store'}
          onClick={() => setTypeFilter(typeFilter === 'store' ? 'all' : 'store')}
        />
        <StatCard
          label="Zones"
          count={locationTypeCounts.zone}
          icon={<MapPin className="h-5 w-5 text-green-500" />}
          active={typeFilter === 'zone'}
          onClick={() => setTypeFilter(typeFilter === 'zone' ? 'all' : 'zone')}
        />
        <StatCard
          label="Bins/Shelves"
          count={locationTypeCounts.bin}
          icon={<Package className="h-5 w-5 text-gray-500" />}
          active={typeFilter === 'bin'}
          onClick={() => setTypeFilter(typeFilter === 'bin' ? 'all' : 'bin')}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => { setEditingLocation(null); setShowCreate(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {/* Locations Tree */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="p-8 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No locations found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Add your first location
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {rootLocations.map((location: Location) => (
              <LocationRow
                key={location.id}
                location={location}
                level={0}
                expanded={expandedLocations.has(location.id)}
                hasChildren={childrenMap.has(location.id)}
                childrenMap={childrenMap}
                expandedLocations={expandedLocations}
                onToggle={toggleExpand}
                onView={setSelectedLocation}
                onEdit={(l) => { setEditingLocation(l); setShowCreate(true) }}
                onDelete={(id) => deleteMutation.mutate(id)}
                typeIcons={typeIcons}
                typeColors={typeColors}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <LocationModal
          location={editingLocation}
          locations={locations}
          onClose={() => { setShowCreate(false); setEditingLocation(null) }}
        />
      )}

      {/* Location Detail Modal */}
      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  )
}

function LocationRow({
  location,
  level,
  expanded,
  hasChildren,
  childrenMap,
  expandedLocations,
  onToggle,
  onView,
  onEdit,
  onDelete,
  typeIcons,
  typeColors,
}: {
  location: Location
  level: number
  expanded: boolean
  hasChildren: boolean
  childrenMap: Map<string, Location[]>
  expandedLocations: Set<string>
  onToggle: (id: string) => void
  onView: (l: Location) => void
  onEdit: (l: Location) => void
  onDelete: (id: string) => void
  typeIcons: Record<string, React.ReactNode>
  typeColors: Record<string, string>
}) {
  const children = childrenMap.get(location.id) || []

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        <div style={{ width: level * 24 }} />
        
        {hasChildren ? (
          <button onClick={() => onToggle(location.id)} className="p-1 hover:bg-gray-200 rounded">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </button>
        ) : (
          <div className="w-6" />
        )}

        <div className={cn('p-1.5 rounded', typeColors[location.type])}>
          {typeIcons[location.type]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{location.name}</span>
            <span className="text-xs text-gray-400">{location.code}</span>
          </div>
          {location.parent_name && (
            <p className="text-sm text-gray-500">in {location.parent_name}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs capitalize',
            typeColors[location.type]
          )}>
            {location.type}
          </span>
          {location.capacity && (
            <span className="text-xs">
              {location.current_utilization || 0}/{location.capacity} used
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 text-xs rounded-full',
            location.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          )}>
            {location.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onView(location)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="View Inventory"
          >
            <Eye className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={() => onEdit(location)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Edit"
          >
            <Edit2 className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={() => onDelete(location.id)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {expanded && children.map((child: Location) => (
        <LocationRow
          key={child.id}
          location={child}
          level={level + 1}
          expanded={expandedLocations.has(child.id)}
          hasChildren={childrenMap.has(child.id)}
          childrenMap={childrenMap}
          expandedLocations={expandedLocations}
          onToggle={onToggle}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          typeIcons={typeIcons}
          typeColors={typeColors}
        />
      ))}
    </>
  )
}

function StatCard({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string
  count: number
  icon: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md',
        active && 'ring-2 ring-blue-500'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">{formatNumber(count)}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function LocationModal({
  location,
  locations,
  onClose,
}: {
  location: Location | null
  locations: Location[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    code: location?.code || '',
    name: location?.name || '',
    type: location?.type || 'warehouse',
    parent_id: location?.parent_id || '',
    capacity: location?.capacity || undefined,
    is_active: location?.is_active ?? true,
    is_pickable: location?.is_pickable ?? true,
    is_receivable: location?.is_receivable ?? true,
    address: location?.address || '',
    notes: location?.notes || '',
  })

  const createMutation = useMutation({
    mutationFn: location ? (data: any) => locationsApi.update(location.id, data) : locationsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      onClose()
    },
  })

  const parentOptions = locations.filter(l => 
    l.id !== location?.id && 
    ['warehouse', 'store', 'zone', 'aisle', 'rack', 'shelf'].includes(l.type)
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4 max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">
            {location ? 'Edit Location' : 'Add Location'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., WH-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="warehouse">Warehouse</option>
                <option value="store">Store</option>
                <option value="zone">Zone</option>
                <option value="aisle">Aisle</option>
                <option value="rack">Rack</option>
                <option value="shelf">Shelf</option>
                <option value="bin">Bin</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Location name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Location</label>
            <select
              value={formData.parent_id}
              onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (Top Level)</option>
              {parentOptions.map((l: Location) => (
                <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
            <input
              type="number"
              min="0"
              value={formData.capacity || ''}
              onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || undefined })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Max items (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Physical address (optional)"
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_pickable}
                onChange={(e) => setFormData({ ...formData, is_pickable: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Pickable (can fulfill orders from here)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_receivable}
                onChange={(e) => setFormData({ ...formData, is_receivable: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Receivable (can receive goods here)</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {location ? 'Update' : 'Create'} Location
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LocationDetailModal({
  location,
  onClose,
}: {
  location: Location
  onClose: () => void
}) {
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['location-inventory', location.id],
    queryFn: () => locationsApi.getInventory(location.id),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl m-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{location.name}</h2>
            <p className="text-sm text-gray-500">{location.code} - {location.type}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Location Info */}
        <div className="px-6 py-3 bg-gray-50 border-b grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Type</p>
            <p className="font-medium capitalize">{location.type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Parent</p>
            <p className="font-medium">{location.parent_name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Capacity</p>
            <p className="font-medium">
              {location.capacity ? `${location.current_utilization || 0}/${location.capacity}` : 'Unlimited'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <p className="font-medium">{location.is_active ? 'Active' : 'Inactive'}</p>
          </div>
        </div>

        {/* Inventory */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : inventory.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No inventory at this location</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reserved</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Movement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {inventory.map((item: LocationInventory) => (
                  <tr key={item.product_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{item.product_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                    <td className="px-6 py-4 text-right">{formatNumber(item.quantity)}</td>
                    <td className="px-6 py-4 text-right text-orange-600">
                      {item.reserved_quantity > 0 ? formatNumber(item.reserved_quantity) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {formatNumber(item.available_quantity)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.last_movement || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
