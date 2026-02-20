import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBarcodeStore } from '@/store/barcodeStore'
import type { Product } from '@/types/barcode'
import { 
  Button, 
  Checkbox,
  Badge,
  Card,
  CardContent,
} from '@shared/components/ui'
import { DataTable, EmptyState, type Column } from '@shared/components/blocks'
import { Package, Printer, CheckSquare, XSquare, Barcode } from 'lucide-react'
import PrintModal from '@/components/modals/PrintModal'

export default function ProductsTab() {
  const {
    selectedProductIds,
    productSearch,
    showPrintModal,
    toggleProductSelection,
    selectAllProducts,
    clearProductSelection,
    setProductSearch,
    setShowPrintModal,
  } = useBarcodeStore()

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () => api.get('/api/products', { params: { search: productSearch, limit: 500 } }).then(r => r.data),
  })

  const products: Product[] = productsData?.products || []
  const allSelected = products.length > 0 && selectedProductIds.length === products.length
  const someSelected = selectedProductIds.length > 0 && selectedProductIds.length < products.length

  const handleSelectAll = () => {
    if (allSelected) {
      clearProductSelection()
    } else {
      selectAllProducts(products.map(p => p.id))
    }
  }

  const columns: Column<Product>[] = [
    {
      id: 'select',
      header: '',
      enableHiding: false,
      cell: (row) => (
        <Checkbox
          checked={selectedProductIds.includes(row.id)}
          onCheckedChange={() => toggleProductSelection(row.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      id: 'name',
      header: 'Product',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-sm text-muted-foreground">
            {row.category || 'Uncategorized'}
          </p>
        </div>
      ),
    },
    {
      id: 'sku',
      header: 'SKU',
      accessorKey: 'sku',
      className: 'text-muted-foreground font-mono text-sm',
    },
    {
      id: 'barcode',
      header: 'Barcode',
      cell: (row) => (
        row.barcode ? (
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            {row.barcode}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">No barcode</span>
        )
      ),
    },
    {
      id: 'batch',
      header: 'Batch/Expiry',
      cell: (row) => (
        <div className="text-sm">
          {row.batchNo && <p className="text-muted-foreground">Batch: {row.batchNo}</p>}
          {row.expiryDate && (
            <p className="text-muted-foreground">
              Exp: {new Date(row.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
            </p>
          )}
          {!row.batchNo && !row.expiryDate && <span className="text-muted-foreground">-</span>}
        </div>
      ),
    },
    {
      id: 'price',
      header: 'Price',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (row) => (
        <div>
          <p className="font-medium">₹{row.price.toFixed(2)}</p>
          {row.mrp > row.price && (
            <p className="text-xs text-muted-foreground line-through">
              MRP ₹{row.mrp.toFixed(2)}
            </p>
          )}
        </div>
      ),
    },
  ]

  const handlePrintComplete = () => {
    setShowPrintModal(false)
    clearProductSelection()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="text-sm text-muted-foreground">
            Select products to print labels • {products.length} products available
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedProductIds.length > 0 && (
            <>
              <Badge variant="secondary" className="px-3 py-1">
                {selectedProductIds.length} selected
              </Badge>
              <Button variant="outline" size="sm" onClick={clearProductSelection}>
                <XSquare className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </>
          )}
          <Button 
            onClick={() => setShowPrintModal(true)}
            disabled={selectedProductIds.length === 0}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Labels
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{products.filter(p => p.barcode).length}</p>
              <p className="text-xs text-muted-foreground">With Barcode</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{products.filter(p => p.batchNo).length}</p>
              <p className="text-xs text-muted-foreground">With Batch No.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-primary">{selectedProductIds.length}</p>
              <p className="text-xs text-muted-foreground">Selected</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product Table */}
      <DataTable
        data={products}
        columns={columns}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search products by name, SKU, or barcode..."
        searchValue={productSearch}
        onSearch={setProductSearch}
        pagination
        pageSize={15}
        hoverable
        onRowClick={(row) => toggleProductSelection(row.id)}
        emptyState={
          <EmptyState
            icon={Package}
            title="No products found"
            description={productSearch ? "Try a different search term" : "Add products in the Product Catalog app"}
          />
        }
      />

      {/* Print Modal */}
      {showPrintModal && (
        <PrintModal
          productIds={selectedProductIds}
          onClose={() => setShowPrintModal(false)}
          onComplete={handlePrintComplete}
        />
      )}
    </div>
  )
}
