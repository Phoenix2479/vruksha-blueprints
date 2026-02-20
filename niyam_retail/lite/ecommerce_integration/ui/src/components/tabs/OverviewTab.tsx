import type { Channel, SyncJob } from '@/types/ecommerce'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@/components/ui'
import { StatsCard } from '@/components/blocks'
import {
  Globe,
  Package,
  ShoppingCart,
  Clock,
  Store,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'

interface OverviewTabProps {
  stats: any
  channels: Channel[]
  recentSyncs: SyncJob[]
}

export default function OverviewTab({ stats, channels, recentSyncs }: OverviewTabProps) {
  const activeChannels = channels.filter(c => c.status === 'active').length
  const totalProducts = channels.reduce((sum, c) => sum + c.products, 0)
  const totalOrders = channels.reduce((sum, c) => sum + c.orders, 0)

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Channels"
          value={activeChannels}
          icon={Globe}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600"
          subtitle={`${channels.length} total channels`}
        />
        <StatsCard
          title="Synced Products"
          value={totalProducts.toLocaleString()}
          icon={Package}
          iconBg="bg-green-500/10"
          iconColor="text-green-600"
        />
        <StatsCard
          title="Pending Orders"
          value={totalOrders}
          icon={ShoppingCart}
          iconBg="bg-yellow-500/10"
          iconColor="text-yellow-600"
        />
        <StatsCard
          title="Last Sync"
          value={stats?.lastSync ? new Date(stats.lastSync).toLocaleTimeString() : 'Never'}
          icon={Clock}
          iconBg="bg-purple-500/10"
          iconColor="text-purple-600"
        />
      </div>

      {/* Channel Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Channel Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map(channel => (
              <div
                key={channel.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  channel.status === 'active' ? 'bg-green-100 text-green-600' :
                  channel.status === 'error' ? 'bg-red-100 text-red-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  <Store className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{channel.name}</p>
                  <p className="text-sm text-muted-foreground">{channel.platform}</p>
                </div>
                <Badge variant={
                  channel.status === 'active' ? 'default' :
                  channel.status === 'error' ? 'destructive' :
                  'secondary'
                }>
                  {channel.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Sync Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentSyncs.slice(0, 5).map(sync => (
              <div
                key={sync.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {sync.status === 'completed' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : sync.status === 'failed' ? (
                    <XCircle className="h-5 w-5 text-red-500" />
                  ) : sync.status === 'running' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  ) : (
                    <Clock className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium capitalize">{sync.type} Sync</p>
                    <p className="text-sm text-muted-foreground">
                      {sync.itemsProcessed} / {sync.itemsTotal} items
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">
                    {new Date(sync.startedAt).toLocaleString()}
                  </p>
                  {sync.errors > 0 && (
                    <p className="text-red-500">{sync.errors} errors</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
