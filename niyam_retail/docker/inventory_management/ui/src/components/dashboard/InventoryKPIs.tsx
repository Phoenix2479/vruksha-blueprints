import { useQuery } from '@tanstack/react-query'
import {
  Card,
  Metric,
  Text,
  Flex,
  ProgressBar,
  BadgeDelta,
  AreaChart,
  DonutChart,
  BarList,
} from '@tremor/react'
import { 
  Package, AlertTriangle, TrendingUp, DollarSign, Clock, Archive,
  ShoppingCart, Layers, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { productsApi, analysisApi, valuationApi } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  metric: string
  subtext?: string
  icon: React.ReactNode
  trend?: number
  trendText?: string
  progress?: number
  color?: 'emerald' | 'amber' | 'rose' | 'blue' | 'violet'
}

function KPICard({ title, metric, subtext, icon, trend, trendText, progress, color = 'blue' }: KPICardProps) {
  const bgColorClass = {
    blue: 'bg-blue-100',
    emerald: 'bg-emerald-100',
    amber: 'bg-amber-100',
    rose: 'bg-rose-100',
    violet: 'bg-violet-100',
  }[color]

  return (
    <Card className="p-4">
      <Flex alignItems="start">
        <div className="flex-1">
          <Flex justifyContent="start" className="gap-3">
            <div className={cn('p-2 rounded-lg', bgColorClass)}>
              {icon}
            </div>
            <div>
              <Text>{title}</Text>
              <Metric className="mt-1">{metric}</Metric>
            </div>
          </Flex>
          {subtext && <Text className="mt-2 text-gray-500">{subtext}</Text>}
          {trend !== undefined && (
            <Flex className="mt-2" justifyContent="start" alignItems="center">
              <BadgeDelta deltaType={trend >= 0 ? 'increase' : 'decrease'} size="xs">
                {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
              </BadgeDelta>
              {trendText && <Text className="ml-2 text-xs text-gray-500">{trendText}</Text>}
            </Flex>
          )}
          {progress !== undefined && (
            <ProgressBar value={progress} color={color} className="mt-3" />
          )}
        </div>
      </Flex>
    </Card>
  )
}

export default function InventoryKPIs() {
  // Valuation summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['valuation-summary'],
    queryFn: () => valuationApi.getSummary({ method: 'weighted_avg' }),
    staleTime: 60000,
  })

  // Low stock items count
  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['low-stock-count'],
    queryFn: () => productsApi.list({ low_stock: true }),
    staleTime: 60000,
  })

  // Dead stock data
  const { data: deadStockData } = useQuery({
    queryKey: ['dead-stock-summary', 90],
    queryFn: () => analysisApi.getDeadStock({ days_threshold: 90 }),
    staleTime: 60000,
  })

  // Stock aging data
  const { data: agingData } = useQuery({
    queryKey: ['aging-summary'],
    queryFn: () => analysisApi.getAging(),
    staleTime: 60000,
  })

  // ABC Analysis data
  const { data: abcData } = useQuery({
    queryKey: ['abc-analysis-summary'],
    queryFn: () => analysisApi.getABC({ period: '90d', criteria: 'revenue' }),
    staleTime: 60000,
  })

  // Valuation history for chart
  const { data: valuationHistory = [] } = useQuery({
    queryKey: ['valuation-history-chart'],
    queryFn: () => valuationApi.getHistory({ period: '30d' }),
    staleTime: 60000,
  })

  // Compute KPI values
  const totalValue = summary?.total_value || 0
  const totalItems = summary?.total_items || 0
  const totalUnits = summary?.total_units || 0
  const grossMargin = summary?.gross_margin_percent || 0
  const lowStockCount = lowStockItems.length || 0
  const deadStockCount = deadStockData?.summary?.total_items || 0
  const deadStockValue = deadStockData?.summary?.total_value || 0
  const avgAge = agingData?.summary?.avg_age || 0
  const oldStockValue = agingData?.brackets
    ?.filter((b: any) => b.min_days >= 90)
    ?.reduce((sum: number, b: any) => sum + b.total_value, 0) || 0

  const stockHealthPercent = totalValue > 0 
    ? Math.max(0, 100 - ((deadStockValue / totalValue) * 100))
    : 100

  // Chart data for valuation trend
  const chartData = valuationHistory.map((h: any) => ({
    date: h.date,
    'Inventory Value': h.total_value || 0,
  }))

  // ABC distribution for donut
  const abcChartData = abcData?.summary ? [
    { name: 'Category A', value: abcData.summary.a_value || 0 },
    { name: 'Category B', value: abcData.summary.b_value || 0 },
    { name: 'Category C', value: abcData.summary.c_value || 0 },
  ] : []

  // Top dead stock items for bar list
  const deadStockBarData = (deadStockData?.items || []).slice(0, 5).map((item: any) => ({
    name: item.product_name,
    value: item.value,
  }))

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Value"
          metric={formatCurrency(totalValue)}
          subtext={`${formatNumber(totalItems)} SKUs`}
          icon={<DollarSign className="h-5 w-5 text-blue-600" />}
          color="blue"
        />
        
        <KPICard
          title="Total Units"
          metric={formatNumber(totalUnits)}
          subtext="In stock"
          icon={<Layers className="h-5 w-5 text-violet-600" />}
          color="violet"
        />

        <KPICard
          title="Gross Margin"
          metric={`${grossMargin.toFixed(1)}%`}
          subtext={formatCurrency(summary?.gross_margin || 0)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          color="emerald"
          progress={Math.min(100, grossMargin)}
        />

        <KPICard
          title="Low Stock"
          metric={formatNumber(lowStockCount)}
          subtext="Need attention"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          color="amber"
          trend={lowStockCount > 10 ? 15 : -5}
          trendText="vs target"
        />

        <KPICard
          title="Dead Stock"
          metric={formatNumber(deadStockCount)}
          subtext={formatCurrency(deadStockValue)}
          icon={<Archive className="h-5 w-5 text-rose-600" />}
          color="rose"
        />

        <KPICard
          title="Stock Health"
          metric={`${stockHealthPercent.toFixed(0)}%`}
          subtext={`Avg age: ${Math.round(avgAge)} days`}
          icon={<Package className="h-5 w-5 text-emerald-600" />}
          color="emerald"
          progress={stockHealthPercent}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Valuation Trend */}
        <Card className="col-span-1 lg:col-span-2">
          <Text className="font-medium">Inventory Value Trend (30 Days)</Text>
          {chartData.length > 0 ? (
            <AreaChart
              className="h-48 mt-4"
              data={chartData}
              index="date"
              categories={['Inventory Value']}
              colors={['blue']}
              valueFormatter={(number) => formatCurrency(number)}
              showLegend={false}
              showGridLines={true}
              showAnimation={true}
              curveType="monotone"
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">
              No historical data available
            </div>
          )}
        </Card>

        {/* ABC Distribution */}
        <Card>
          <Text className="font-medium">ABC Classification</Text>
          {abcChartData.length > 0 && abcChartData.some(d => d.value > 0) ? (
            <div className="flex flex-col items-center mt-4">
              <DonutChart
                className="h-40"
                data={abcChartData}
                category="value"
                index="name"
                valueFormatter={(number) => formatCurrency(number)}
                colors={['emerald', 'amber', 'rose']}
                showAnimation={true}
              />
              <div className="flex gap-4 mt-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full"></span>
                  A: {abcData?.summary?.a_items || 0}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                  B: {abcData?.summary?.b_items || 0}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-rose-500 rounded-full"></span>
                  C: {abcData?.summary?.c_items || 0}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">
              No ABC data available
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dead Stock Top Items */}
        <Card>
          <Flex>
            <Text className="font-medium">Top Dead Stock Items</Text>
            <Text className="text-rose-600">{formatCurrency(deadStockValue)} at risk</Text>
          </Flex>
          {deadStockBarData.length > 0 ? (
            <BarList
              data={deadStockBarData}
              className="mt-4"
              valueFormatter={(number) => formatCurrency(number)}
              color="rose"
              showAnimation={true}
            />
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400">
              No dead stock found
            </div>
          )}
        </Card>

        {/* Stock Aging Summary */}
        <Card>
          <Text className="font-medium">Stock Aging Distribution</Text>
          <div className="mt-4 space-y-3">
            {(agingData?.brackets || []).slice(0, 4).map((bracket: any) => (
              <div key={bracket.bracket}>
                <Flex>
                  <Text className="text-sm">{bracket.bracket} days</Text>
                  <Text className="text-sm">{formatCurrency(bracket.total_value)}</Text>
                </Flex>
                <ProgressBar 
                  value={bracket.percent_of_value || 0} 
                  color={
                    bracket.min_days >= 90 ? 'rose' :
                    bracket.min_days >= 60 ? 'amber' : 'emerald'
                  }
                  className="mt-1"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
