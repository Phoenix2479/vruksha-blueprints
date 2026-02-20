import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  competitorsApi,
  priceComparisonApi,
  marketTrendsApi,
  alertsApi,
  priceWatchApi,
  type Competitor,
  type PriceComparison,
  type MarketTrend,
  type CompetitorAlert,
  type PriceWatch,
} from '../api/competitorApi';
import { formatCurrency } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
} from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '@/components/blocks';
import {
  Eye,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Bell,
  Target,
  BarChart3,
  Globe,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ExternalLink,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

const CURRENCY = 'INR';

export default function CompetitorIntelPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCompetitorDialogOpen, setIsCompetitorDialogOpen] = useState(false);
  const [isWatchDialogOpen, setIsWatchDialogOpen] = useState(false);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Queries
  const { data: stats } = useQuery({
    queryKey: ['competitor-stats'],
    queryFn: competitorsApi.getStats,
  });

  const { data: competitors = [], isLoading: loadingCompetitors } = useQuery({
    queryKey: ['competitors'],
    queryFn: competitorsApi.list,
  });

  const { data: comparisons = [] } = useQuery({
    queryKey: ['price-comparisons'],
    queryFn: () => priceComparisonApi.compare(),
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['market-trends'],
    queryFn: marketTrendsApi.getAll,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['competitor-alerts'],
    queryFn: () => alertsApi.list(),
  });

  const { data: watches = [] } = useQuery({
    queryKey: ['price-watches'],
    queryFn: priceWatchApi.list,
  });

  const formatPrice = (amount: number) => formatCurrency(amount, CURRENCY);

  // Mutations
  const createCompetitorMutation = useMutation({
    mutationFn: competitorsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] });
      queryClient.invalidateQueries({ queryKey: ['competitor-stats'] });
      setIsCompetitorDialogOpen(false);
    },
  });

  const updateCompetitorMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof competitorsApi.update>[1] }) =>
      competitorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] });
      setEditingCompetitor(null);
    },
  });

  const deleteCompetitorMutation = useMutation({
    mutationFn: competitorsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] });
      queryClient.invalidateQueries({ queryKey: ['competitor-stats'] });
    },
  });

  const markAlertReadMutation = useMutation({
    mutationFn: alertsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor-alerts'] });
    },
  });

  const createWatchMutation = useMutation({
    mutationFn: priceWatchApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-watches'] });
      setIsWatchDialogOpen(false);
    },
  });

  const deleteWatchMutation = useMutation({
    mutationFn: priceWatchApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-watches'] });
    },
  });

  const unreadAlerts = alerts.filter(a => !a.read).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Eye className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold">Competitor Intelligence</h1>
              <p className="text-sm text-muted-foreground">Track competitor prices & market trends</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="relative">
              <Bell className="h-4 w-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadAlerts}
                </span>
              )}
            </Button>
            <Button onClick={() => setIsCompetitorDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Competitor
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
            <TabsTrigger value="trends">Market Trends</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              {unreadAlerts > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  {unreadAlerts}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="watches">Price Watches</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardView
              stats={stats}
              alerts={alerts}
              comparisons={comparisons}
              trends={trends}
              formatPrice={formatPrice}
              onMarkAlertRead={(id) => markAlertReadMutation.mutate(id)}
            />
          </TabsContent>

          <TabsContent value="competitors" className="mt-6">
            <CompetitorsView
              competitors={competitors}
              loading={loadingCompetitors}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onAdd={() => setIsCompetitorDialogOpen(true)}
              onEdit={setEditingCompetitor}
              onDelete={(id) => {
                if (confirm('Delete this competitor?')) {
                  deleteCompetitorMutation.mutate(id);
                }
              }}
            />
          </TabsContent>

          <TabsContent value="comparison" className="mt-6">
            <ComparisonView
              comparisons={comparisons}
              formatPrice={formatPrice}
            />
          </TabsContent>

          <TabsContent value="trends" className="mt-6">
            <TrendsView
              trends={trends}
              formatPrice={formatPrice}
            />
          </TabsContent>

          <TabsContent value="alerts" className="mt-6">
            <AlertsView
              alerts={alerts}
              onMarkRead={(id) => markAlertReadMutation.mutate(id)}
            />
          </TabsContent>

          <TabsContent value="watches" className="mt-6">
            <WatchesView
              watches={watches}
              onAdd={() => setIsWatchDialogOpen(true)}
              onDelete={(id) => deleteWatchMutation.mutate(id)}
              formatPrice={formatPrice}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Competitor Dialog */}
      <CompetitorFormDialog
        open={isCompetitorDialogOpen || !!editingCompetitor}
        onOpenChange={(open) => {
          if (!open) {
            setIsCompetitorDialogOpen(false);
            setEditingCompetitor(null);
          }
        }}
        onSubmit={(data) => {
          if (editingCompetitor) {
            updateCompetitorMutation.mutate({ id: editingCompetitor.id, data });
          } else {
            createCompetitorMutation.mutate(data);
          }
        }}
        isLoading={createCompetitorMutation.isPending || updateCompetitorMutation.isPending}
        initialData={editingCompetitor}
      />

      {/* Watch Dialog */}
      <WatchFormDialog
        open={isWatchDialogOpen}
        onOpenChange={setIsWatchDialogOpen}
        onSubmit={(data) => createWatchMutation.mutate(data)}
        isLoading={createWatchMutation.isPending}
        competitors={competitors}
      />
    </div>
  );
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

function DashboardView({
  stats,
  alerts,
  comparisons,
  trends,
  formatPrice,
  onMarkAlertRead,
}: {
  stats?: ReturnType<typeof competitorsApi.getStats> extends Promise<infer T> ? T : never;
  alerts: CompetitorAlert[];
  comparisons: PriceComparison[];
  trends: MarketTrend[];
  formatPrice: (n: number) => string;
  onMarkAlertRead: (id: number) => void;
}) {
  const recentAlerts = alerts.filter(a => !a.read).slice(0, 5);
  const priceDiff = stats?.avgPriceDiff || 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Competitors Tracked"
          value={`${stats?.activeCompetitors || 0}`}
          icon={Eye}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          subtitle={`${stats?.totalCompetitors || 0} total`}
        />
        <StatsCard
          title="Products Monitored"
          value={`${stats?.trackedProducts || 0}`}
          icon={Target}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
        />
        <StatsCard
          title="Price Changes (24h)"
          value={`${stats?.priceChanges24h || 0}`}
          icon={RefreshCw}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-100"
        />
        <StatsCard
          title="Avg Price Diff"
          value={`${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(1)}%`}
          icon={priceDiff >= 0 ? TrendingUp : TrendingDown}
          iconColor={priceDiff >= 0 ? 'text-green-600' : 'text-red-600'}
          iconBgColor={priceDiff >= 0 ? 'bg-green-100' : 'bg-red-100'}
          subtitle={`${stats?.productsBelow || 0} below, ${stats?.productsAbove || 0} above`}
        />
      </div>

      {/* Alerts & Comparisons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAlerts.length > 0 ? (
              <div className="space-y-2">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between p-3 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                    onClick={() => onMarkAlertRead(alert.id)}
                  >
                    <div className="flex items-start gap-2">
                      <AlertIcon type={alert.type} severity={alert.severity} />
                      <div>
                        <p className="text-sm font-medium">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">{alert.competitorName}</p>
                      </div>
                    </div>
                    <Badge variant={alert.severity === 'high' ? 'destructive' : 'outline'} className="text-xs">
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No new alerts</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Price Position Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comparisons.length > 0 ? (
              <div className="space-y-3">
                {comparisons.slice(0, 5).map((c) => (
                  <div key={c.productId} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        Our: {formatPrice(c.ourPrice)} | Avg: {formatPrice(c.avgCompetitorPrice)}
                      </p>
                    </div>
                    <PositionBadge position={c.pricePosition} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No comparison data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Market Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Trends by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {trends.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {trends.slice(0, 8).map((trend) => (
                <div key={trend.category} className="p-3 border rounded-lg">
                  <p className="text-sm font-medium truncate">{trend.category}</p>
                  <p className="text-lg font-bold">{formatPrice(trend.avgPrice)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {trend.trend === 'up' ? (
                      <ArrowUpRight className="h-4 w-4 text-green-600" />
                    ) : trend.trend === 'down' ? (
                      <ArrowDownRight className="h-4 w-4 text-red-600" />
                    ) : (
                      <Minus className="h-4 w-4 text-gray-400" />
                    )}
                    <span className={`text-sm ${
                      trend.trend === 'up' ? 'text-green-600' : trend.trend === 'down' ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No trend data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// COMPETITORS VIEW
// ============================================================================

function CompetitorsView({
  competitors,
  loading,
  searchTerm,
  onSearchChange,
  onAdd,
  onEdit,
  onDelete,
}: {
  competitors: Competitor[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onAdd: () => void;
  onEdit: (c: Competitor) => void;
  onDelete: (id: number) => void;
}) {
  const filtered = competitors.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search competitors..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Competitor
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Eye className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No competitors found</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Add First Competitor
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                    <TableCell>
                      {c.website ? (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          Visit
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{c.location || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={c.status === 'active' ? 'active' : c.status === 'monitoring' ? 'warning' : 'inactive'}
                        label={c.status}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => onDelete(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ============================================================================
// COMPARISON VIEW
// ============================================================================

function ComparisonView({
  comparisons,
  formatPrice,
}: {
  comparisons: PriceComparison[];
  formatPrice: (n: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Price Comparison Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Our Price</TableHead>
                <TableHead className="text-right">Lowest</TableHead>
                <TableHead className="text-right">Avg Competitor</TableHead>
                <TableHead className="text-right">Highest</TableHead>
                <TableHead>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No comparison data available
                  </TableCell>
                </TableRow>
              ) : (
                comparisons.map((c) => (
                  <TableRow key={c.productId}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.productName}</p>
                        <p className="text-xs text-muted-foreground">{c.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPrice(c.ourPrice)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatPrice(c.lowestPrice)}</TableCell>
                    <TableCell className="text-right">{formatPrice(c.avgCompetitorPrice)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatPrice(c.highestPrice)}</TableCell>
                    <TableCell><PositionBadge position={c.pricePosition} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TRENDS VIEW
// ============================================================================

function TrendsView({
  trends,
  formatPrice,
}: {
  trends: MarketTrend[];
  formatPrice: (n: number) => string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const selectedTrend = trends.find(t => t.category === selectedCategory);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {trends.map((trend) => (
          <Card
            key={trend.category}
            className={`cursor-pointer hover:border-primary transition-colors ${
              selectedCategory === trend.category ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => setSelectedCategory(trend.category)}
          >
            <CardContent className="pt-4">
              <p className="text-sm font-medium truncate">{trend.category}</p>
              <p className="text-2xl font-bold">{formatPrice(trend.avgPrice)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">{trend.competitorCount} competitors</span>
                <div className="flex items-center gap-1">
                  {trend.trend === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : trend.trend === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  ) : (
                    <Minus className="h-4 w-4 text-gray-400" />
                  )}
                  <span className={`text-sm ${
                    trend.trend === 'up' ? 'text-green-600' : trend.trend === 'down' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedTrend && selectedTrend.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedTrend.category} - Price Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedTrend.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// ALERTS VIEW
// ============================================================================

function AlertsView({
  alerts,
  onMarkRead,
}: {
  alerts: CompetitorAlert[];
  onMarkRead: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No alerts yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between p-4 rounded-lg border ${
                    alert.read ? 'bg-muted/30' : 'bg-card border-primary/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertIcon type={alert.type} severity={alert.severity} />
                    <div>
                      <p className={`font-medium ${alert.read ? 'text-muted-foreground' : ''}`}>
                        {alert.message}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {alert.competitorName}
                        {alert.productName && ` • ${alert.productName}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'default' : 'secondary'}>
                      {alert.severity}
                    </Badge>
                    {!alert.read && (
                      <Button variant="ghost" size="sm" onClick={() => onMarkRead(alert.id)}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// WATCHES VIEW
// ============================================================================

function WatchesView({
  watches,
  onAdd,
  onDelete,
  formatPrice,
}: {
  watches: PriceWatch[];
  onAdd: () => void;
  onDelete: (id: number) => void;
  formatPrice: (n: number) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Create Price Watch
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Target Price</TableHead>
                <TableHead className="text-right">Current Lowest</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {watches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No price watches set</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Create First Watch
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                watches.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.productName}</TableCell>
                    <TableCell className="text-right">{formatPrice(w.targetPrice)}</TableCell>
                    <TableCell className="text-right">
                      <span className={w.currentLowest <= w.targetPrice ? 'text-green-600 font-semibold' : ''}>
                        {formatPrice(w.currentLowest)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={w.status === 'triggered' ? 'active' : w.status === 'expired' ? 'inactive' : 'warning'}
                        label={w.status}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {w.expiresAt ? new Date(w.expiresAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => onDelete(w.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function AlertIcon({ type, severity }: { type: CompetitorAlert['type']; severity: CompetitorAlert['severity'] }) {
  const colorClass = severity === 'high' ? 'text-red-600' : severity === 'medium' ? 'text-amber-600' : 'text-blue-600';

  if (type === 'price_drop') return <TrendingDown className={`h-5 w-5 ${colorClass}`} />;
  if (type === 'price_increase') return <TrendingUp className={`h-5 w-5 ${colorClass}`} />;
  if (type === 'out_of_stock') return <XCircle className={`h-5 w-5 ${colorClass}`} />;
  if (type === 'back_in_stock') return <CheckCircle className={`h-5 w-5 ${colorClass}`} />;
  return <AlertTriangle className={`h-5 w-5 ${colorClass}`} />;
}

function PositionBadge({ position }: { position: PriceComparison['pricePosition'] }) {
  if (position === 'lowest') return <Badge className="bg-green-100 text-green-800">Lowest</Badge>;
  if (position === 'competitive') return <Badge className="bg-blue-100 text-blue-800">Competitive</Badge>;
  if (position === 'above_avg') return <Badge className="bg-amber-100 text-amber-800">Above Avg</Badge>;
  return <Badge className="bg-red-100 text-red-800">Highest</Badge>;
}

// ============================================================================
// COMPETITOR FORM DIALOG
// ============================================================================

function CompetitorFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Parameters<typeof competitorsApi.create>[0]) => void;
  isLoading: boolean;
  initialData?: Competitor | null;
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    website: initialData?.website || '',
    category: initialData?.category || '',
    location: initialData?.location || '',
    notes: initialData?.notes || '',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Competitor' : 'Add Competitor'}</DialogTitle>
          <DialogDescription>Track a competitor's pricing and products</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Competitor name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Electronics, Grocery"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="City or region"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes"
            />
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Saving...' : initialData ? 'Update' : 'Add Competitor'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name || !formData.category}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// WATCH FORM DIALOG
// ============================================================================

function WatchFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  competitors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Parameters<typeof priceWatchApi.create>[0]) => void;
  isLoading: boolean;
  competitors: Competitor[];
}) {
  const [formData, setFormData] = useState({
    productId: '',
    targetPrice: 0,
    competitorId: undefined as number | undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Price Watch</DialogTitle>
          <DialogDescription>Get notified when a product reaches your target price</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Product ID *</Label>
            <Input
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              placeholder="Enter product ID"
            />
          </div>
          <div className="space-y-2">
            <Label>Target Price *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.targetPrice || ''}
              onChange={(e) => setFormData({ ...formData, targetPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Watch Specific Competitor (Optional)</Label>
            <Select
              value={formData.competitorId?.toString() || ''}
              onValueChange={(v) => setFormData({ ...formData, competitorId: v ? parseInt(v) : undefined })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All competitors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All competitors</SelectItem>
                {competitors.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Creating...' : 'Create Watch'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.productId || formData.targetPrice <= 0}
        />
      </DialogContent>
    </Dialog>
  );
}
