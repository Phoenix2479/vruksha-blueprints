import type { Product } from '@/types/inventory'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Button, Badge } from '@/components/ui'
import {
  DataTable,
  StatsCard,
  EmptyState,
  type Column,
} from '@/components/blocks'
import {
  Box,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  ArrowUpDown,
} from 'lucide-react'

interface ProductsContentProps {
  products: Product[]
  isLoading: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  filterLowStock: boolean
  onFilterLowStockChange: (value: boolean) => void
  onAdd: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onAdjust: (product: Product) => void
}

export default function ProductsContent({
  products,
  isLoading,
  searchQuery,
  onSearchChange,
  filterLowStock,
  onFilterLowStockChange,
  onAdd,
  onEdit,
  onDelete,
  onAdjust,
}: ProductsContentProps) {
  const totalValue = products.reduce(
    (sum, p) => sum + (p.unit_price * p.quantity), 
    0
  )
  const lowStockProducts = products.filter(
    p => p.quantity <= (p.reorder_level || 10)
  )
  const outOfStockProducts = products.filter(p => p.quantity === 0)

  const columns: Column<Product>[] = [
    {
      id: 'name',
      header: 'Product',
      cell: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          {row.category_name && (
            <p className="text-sm text-muted-foreground">{row.category_name}</p>
          )}
        </div>
      ),
    },
    {
      id: 'sku',
      header: 'SKU',
      accessorKey: 'sku',
      className: 'text-muted-foreground',
    },
    {
      id: 'price',
      header: 'Price',
      headerClassName: 'text-right',
      className: 'text-right font-medium',
      cell: (row) => formatCurrency(row.unit_price),
    },
    {
      id: 'stock',
      header: 'Stock',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (row) => (
        <span className={cn(
          'font-medium',
          row.quantity === 0 
            ? 'text-destructive' 
            : row.quantity <= (row.reorder_level || 10) 
              ? 'text-yellow-600 dark:text-yellow-400' 
              : 'text-foreground'
        )}>
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      headerClassName: 'text-center',
      className: 'text-center',
      cell: (row) => {
        const isOutOfStock = row.quantity === 0
        const isLowStock = row.quantity <= (row.reorder_level || 10)
        
        return (
          <Badge variant={
            isOutOfStock ? 'destructive' : isLowStock ? 'secondary' : 'default'
          }>
            {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      enableHiding: false,
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onAdjust(row) }}
            className="h-8 w-8"
            title="Adjust Stock"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onEdit(row) }}
            className="h-8 w-8"
            title="Edit Product"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onDelete(row) }}
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete Product"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Products"
          value={formatNumber(products.length)}
          icon={Box}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Inventory Value"
          value={formatCurrency(totalValue)}
          icon={TrendingUp}
          iconBg="bg-green-500/10"
          iconColor="text-green-600"
        />
        <StatsCard
          title="Low Stock"
          value={formatNumber(lowStockProducts.length)}
          icon={AlertTriangle}
          iconBg="bg-yellow-500/10"
          iconColor="text-yellow-600"
          link={lowStockProducts.length > 0 ? {
            text: filterLowStock ? 'Show all' : 'View all',
            onClick: () => onFilterLowStockChange(!filterLowStock),
          } : undefined}
        />
        <StatsCard
          title="Out of Stock"
          value={formatNumber(outOfStockProducts.length)}
          icon={TrendingDown}
          iconBg="bg-red-500/10"
          iconColor="text-red-600"
        />
      </div>

      {/* Data Table */}
      <DataTable
        data={products}
        columns={columns}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search products..."
        searchValue={searchQuery}
        onSearch={onSearchChange}
        pagination
        pageSize={10}
        hoverable
        emptyState={
          <EmptyState
            icon={Box}
            title="No products found"
            description="Add your first product to get started"
            action={{
              label: 'Add Product',
              onClick: onAdd,
              icon: Plus,
            }}
          />
        }
      />
    </div>
  )
}
