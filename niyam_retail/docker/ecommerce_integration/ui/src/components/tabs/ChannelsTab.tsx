import type { Channel } from '@/types/ecommerce'
import { Button, Badge } from '@shared/components/ui'
import { DataTable, EmptyState, type Column } from '@shared/components/blocks'
import { Store, ExternalLink } from 'lucide-react'

interface ChannelsTabProps {
  channels: Channel[]
}

export default function ChannelsTab({ channels }: ChannelsTabProps) {
  const columns: Column<Channel>[] = [
    {
      id: 'name',
      header: 'Channel',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Store className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-sm text-muted-foreground">{row.platform}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={
          row.status === 'active' ? 'default' :
          row.status === 'error' ? 'destructive' :
          'secondary'
        }>
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'products',
      header: 'Products',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => row.products.toLocaleString(),
    },
    {
      id: 'orders',
      header: 'Pending Orders',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => row.orders,
    },
    {
      id: 'lastSync',
      header: 'Last Sync',
      cell: (row) => new Date(row.lastSync).toLocaleString(),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <Button variant="ghost" size="sm">
          <ExternalLink className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      data={channels}
      columns={columns}
      searchable
      searchPlaceholder="Search channels..."
      emptyState={
        <EmptyState
          icon={Store}
          title="No channels connected"
          description="Connect your first marketplace to start syncing"
          action={{
            label: 'Add Channel',
            onClick: () => {},
          }}
        />
      }
    />
  )
}
