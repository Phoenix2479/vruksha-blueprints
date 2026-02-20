import type { SyncJob } from '@/types/ecommerce'
import { Badge } from '@/components/ui'
import { DataTable, EmptyState, type Column } from '@/components/blocks'
import { Package, ShoppingCart, TrendingUp, Clock } from 'lucide-react'

interface SyncHistoryTabProps {
  syncs: SyncJob[]
}

export default function SyncHistoryTab({ syncs }: SyncHistoryTabProps) {
  const columns: Column<SyncJob>[] = [
    {
      id: 'type',
      header: 'Type',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.type === 'products' ? <Package className="h-4 w-4" /> :
           row.type === 'orders' ? <ShoppingCart className="h-4 w-4" /> :
           <TrendingUp className="h-4 w-4" />}
          <span className="capitalize">{row.type}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={
          row.status === 'completed' ? 'default' :
          row.status === 'failed' ? 'destructive' :
          row.status === 'running' ? 'secondary' :
          'outline'
        }>
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${(row.itemsProcessed / row.itemsTotal) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {row.itemsProcessed}/{row.itemsTotal}
          </span>
        </div>
      ),
    },
    {
      id: 'errors',
      header: 'Errors',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (row) => row.errors > 0 ? (
        <Badge variant="destructive">{row.errors}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    },
    {
      id: 'startedAt',
      header: 'Started',
      cell: (row) => new Date(row.startedAt).toLocaleString(),
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: (row) => {
        if (!row.completedAt) return '-'
        const duration = new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime()
        const seconds = Math.floor(duration / 1000)
        return `${seconds}s`
      },
    },
  ]

  return (
    <DataTable
      data={syncs}
      columns={columns}
      searchable
      pagination
      pageSize={10}
      emptyState={
        <EmptyState
          icon={Clock}
          title="No sync history"
          description="Sync jobs will appear here"
        />
      }
    />
  )
}
