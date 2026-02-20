import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportingApi, type DashboardStats, type TopProduct } from '../api/reportingApi';

// Shared UI components
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Skeleton,
  Progress,
} from '@shared/components/ui';

import {
  Sidebar,
  PageHeader,
  StatsCard,
  EmptyState,
  ThemeToggle,
  type SidebarGroup,
} from '@shared/components/blocks';

// Icons
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Calendar,
  Download,
  Loader2,
  FileText,
  PieChart,
  LineChart,
  Activity,
  Users,
  Package,
  Target,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
} from 'lucide-react';

// Tab types
type TabId = 'dashboard' | 'sales' | 'products' | 'customers' | 'inventory' | 'custom';

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Analytics',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'sales', label: 'Sales Reports', icon: DollarSign },
      { id: 'products', label: 'Product Analytics', icon: Package },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'customers', label: 'Customer Insights', icon: Users },
      { id: 'inventory', label: 'Inventory Reports', icon: Activity },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'custom', label: 'Custom Reports', icon: FileText },
    ],
  },
];

export default function ReportingMainPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState('7d');

  const dateParams = useMemo(() => {
    const to = new Date();
    const from = new Date();
    if (dateRange === '7d') from.setDate(from.getDate() - 7);
    else if (dateRange === '30d') from.setDate(from.getDate() - 30);
    else if (dateRange === '90d') from.setDate(from.getDate() - 90);
    return { from, to };
  }, [dateRange]);

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<DashboardStats>({
    queryKey: ['reporting-dashboard'],
    queryFn: reportingApi.getDashboard,
  });

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-report', dateRange],
    queryFn: () => reportingApi.getSalesReport(dateParams.from, dateParams.to, 'day'),
  });

  const { data: topProducts = [] } = useQuery<TopProduct[]>({
    queryKey: ['top-products', dateRange],
    queryFn: () => reportingApi.getTopProducts(dateParams.from, dateParams.to, 10),
  });

  const salesData = salesReport?.data || [];
  const totalSales = salesData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = salesData.reduce((sum, d) => sum + d.transactions, 0);
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const maxSalesDay = salesData.length > 0
    ? salesData.reduce((max, d) => d.revenue > max.revenue ? d : max, salesData[0])
    : null;

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardContent
            dashboard={dashboard}
            dashboardLoading={dashboardLoading}
            salesData={salesData}
            salesLoading={salesLoading}
            topProducts={topProducts}
            totalSales={totalSales}
            totalOrders={totalOrders}
            avgOrderValue={avgOrderValue}
            maxSalesDay={maxSalesDay}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
        );
      case 'sales':
        return <SalesContent salesData={salesData} loading={salesLoading} />;
      case 'products':
        return <ProductsContent products={topProducts} />;
      case 'customers':
        return <CustomersContent />;
      case 'inventory':
        return <InventoryContent />;
      case 'custom':
        return <CustomReportsContent />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        groups={sidebarGroups}
        activeItem={activeTab}
        onItemClick={(id) => setActiveTab(id as TabId)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        header={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100">
              <BarChart3 className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Analytics</h1>
              <p className="text-xs text-muted-foreground">Reports & Insights</p>
            </div>
          </div>
        }
        footer={
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Today's Sales</span>
              <Badge variant="default" className="bg-green-500">
                ${(dashboard?.todaySales.total || 0).toLocaleString()}
              </Badge>
            </div>
          </div>
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          title={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label || 'Analytics'}
          description={getTabDescription(activeTab)}
          icon={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.icon}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-100"
          sticky
          actions={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>
          }
        />

        <ScrollArea className="flex-1">
          <div className="p-6">
            {renderContent()}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function getTabDescription(tab: TabId): string {
  switch (tab) {
    case 'dashboard': return 'Key performance metrics';
    case 'sales': return 'Sales performance analysis';
    case 'products': return 'Product performance';
    case 'customers': return 'Customer behavior insights';
    case 'inventory': return 'Inventory health reports';
    case 'custom': return 'Build custom reports';
    default: return '';
  }
}

// Dashboard Content
function DashboardContent({
  dashboard, dashboardLoading, salesData, salesLoading, topProducts,
  totalSales, totalOrders, avgOrderValue, maxSalesDay, dateRange, setDateRange
}: {
  dashboard: DashboardStats | undefined;
  dashboardLoading: boolean;
  salesData: any[];
  salesLoading: boolean;
  topProducts: TopProduct[];
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  maxSalesDay: any;
  dateRange: string;
  setDateRange: (v: string) => void;
}) {
  if (dashboardLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Today's Sales"
          value={`$${(dashboard?.todaySales.total || 0).toLocaleString()}`}
          subtitle={`${dashboard?.todaySales.count || 0} transactions`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
        <StatsCard
          title="Period Revenue"
          value={`$${totalSales.toLocaleString()}`}
          icon={ShoppingCart}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
        />
        <StatsCard
          title="Avg. Order Value"
          value={`$${avgOrderValue.toFixed(2)}`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
        />
        <StatsCard
          title="Best Day"
          value={maxSalesDay?.period || 'N/A'}
          subtitle={maxSalesDay ? `$${maxSalesDay.revenue.toLocaleString()}` : ''}
          icon={Calendar}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Daily Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : salesData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No sales data for this period
              </div>
            ) : (
              <div className="space-y-3">
                {salesData.slice(0, 7).map((day, index) => {
                  const maxRevenue = Math.max(...salesData.map(d => d.revenue));
                  const percentage = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                  const prevDay = salesData[index + 1];
                  const trend = prevDay ? day.revenue - prevDay.revenue : 0;

                  return (
                    <div key={day.period} className="flex items-center gap-3">
                      <span className="w-20 text-sm font-medium truncate">{day.period}</span>
                      <div className="flex-1">
                        <Progress value={percentage} className="h-6" />
                      </div>
                      <div className="w-28 text-right flex items-center justify-end gap-1">
                        <span className="text-sm font-medium">${day.revenue.toLocaleString()}</span>
                        {trend !== 0 && (
                          trend > 0 ? (
                            <ArrowUpRight className="h-3 w-3 text-green-500" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-red-500" />
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No product sales data
              </div>
            ) : (
              <div className="space-y-4">
                {topProducts.slice(0, 5).map((product, i) => (
                  <div key={product.sku} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{product.name || product.sku}</p>
                        <p className="text-xs text-muted-foreground">{product.quantitySold} units sold</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${product.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Reports */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Quick Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Sales Summary', icon: DollarSign },
              { name: 'Inventory Report', icon: Package },
              { name: 'Customer Analytics', icon: Users },
              { name: 'Tax Report', icon: FileText },
              { name: 'Profit & Loss', icon: TrendingUp },
              { name: 'Staff Performance', icon: Target },
            ].map((report) => (
              <div
                key={report.name}
                className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <report.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{report.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Sales Content
function SalesContent({ salesData, loading }: { salesData: any[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sales by Day</CardTitle>
        </CardHeader>
        <CardContent>
          {salesData.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No sales data"
              description="Sales data will appear here once you have transactions"
            />
          ) : (
            <div className="space-y-4">
              {salesData.map((day) => (
                <div key={day.period} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">{day.period}</p>
                    <p className="text-sm text-muted-foreground">{day.transactions} transactions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">${day.revenue.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Avg: ${(day.revenue / day.transactions || 0).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Products Content
function ProductsContent({ products }: { products: TopProduct[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Product Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No product data"
            description="Product analytics will appear here once you have sales"
          />
        ) : (
          <div className="space-y-4">
            {products.map((product, i) => (
              <div key={product.sku} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{product.name || product.sku}</p>
                    <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">${product.revenue.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{product.quantitySold} units</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Customers Content
function CustomersContent() {
  return (
    <EmptyState
      icon={Users}
      title="Customer Insights"
      description="Customer analytics and behavior insights coming soon"
    />
  );
}

// Inventory Content
function InventoryContent() {
  return (
    <EmptyState
      icon={Activity}
      title="Inventory Reports"
      description="Inventory health and movement reports coming soon"
    />
  );
}

// Custom Reports Content
function CustomReportsContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Custom Report Builder</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-medium text-lg mb-2">Build Your Own Reports</h3>
          <p className="text-muted-foreground mb-4">
            Create custom reports by selecting data sources and filters
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


