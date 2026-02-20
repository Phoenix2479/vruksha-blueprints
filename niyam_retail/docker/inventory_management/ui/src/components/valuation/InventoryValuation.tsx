import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, TrendingUp, TrendingDown, PieChart, BarChart3,
  Calendar, Download, Loader2, RefreshCw
} from 'lucide-react'
import {
  AreaChart,
  DonutChart,
  BarChart,
  Card,
  Metric,
  Text,
  Flex,
  ProgressBar,
  BadgeDelta,
} from '@tremor/react'
import { valuationApi } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import type { ValuationSummary, ValuationByCategory, ValuationByLocation } from '@/types/inventory'

export default function InventoryValuation() {
  const [valuationMethod, setValuationMethod] = useState<string>('weighted_avg')
  const [viewMode, setViewMode] = useState<'summary' | 'category' | 'location'>('summary')

  const { data: summary, isLoading: summaryLoading, refetch } = useQuery({
    queryKey: ['valuation', valuationMethod],
    queryFn: () => valuationApi.getSummary({ method: valuationMethod }),
  })

  const { data: byCategory = [] } = useQuery({
    queryKey: ['valuation-category', valuationMethod],
    queryFn: () => valuationApi.getByCategory({ method: valuationMethod }),
    enabled: viewMode === 'category',
  })

  const { data: byLocation = [] } = useQuery({
    queryKey: ['valuation-location', valuationMethod],
    queryFn: () => valuationApi.getByLocation({ method: valuationMethod }),
    enabled: viewMode === 'location',
  })

  const { data: history = [] } = useQuery({
    queryKey: ['valuation-history'],
    queryFn: () => valuationApi.getHistory({ period: '30d' }),
  })

  const valuationData: ValuationSummary = summary || {
    total_value: 0,
    total_cost: 0,
    total_retail: 0,
    gross_margin: 0,
    gross_margin_percent: 0,
    total_items: 0,
    total_units: 0,
    valuation_method: 'weighted_avg',
    as_of_date: new Date().toISOString(),
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={valuationMethod}
            onChange={(e) => setValuationMethod(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="weighted_avg">Weighted Average Cost</option>
            <option value="fifo">FIFO (First In, First Out)</option>
            <option value="lifo">LIFO (Last In, First Out)</option>
            <option value="specific">Specific Identification</option>
          </select>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ValueCard
          label="Total Inventory Value"
          value={formatCurrency(valuationData.total_value)}
          icon={<DollarSign className="h-6 w-6 text-blue-500" />}
          color="blue"
        />
        <ValueCard
          label="Total Cost"
          value={formatCurrency(valuationData.total_cost)}
          icon={<TrendingDown className="h-6 w-6 text-red-500" />}
          color="red"
        />
        <ValueCard
          label="Retail Value"
          value={formatCurrency(valuationData.total_retail)}
          icon={<TrendingUp className="h-6 w-6 text-green-500" />}
          color="green"
        />
        <ValueCard
          label="Gross Margin"
          value={`${valuationData.gross_margin_percent.toFixed(1)}%`}
          subValue={formatCurrency(valuationData.gross_margin)}
          icon={<PieChart className="h-6 w-6 text-purple-500" />}
          color="purple"
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total SKUs</p>
          <p className="text-2xl font-bold">{formatNumber(valuationData.total_items)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Units</p>
          <p className="text-2xl font-bold">{formatNumber(valuationData.total_units)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Avg. Value per SKU</p>
          <p className="text-2xl font-bold">
            {formatCurrency(valuationData.total_items ? valuationData.total_value / valuationData.total_items : 0)}
          </p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b">
          <div className="flex">
            {[
              { id: 'summary', label: 'Summary', icon: BarChart3 },
              { id: 'category', label: 'By Category', icon: PieChart },
              { id: 'location', label: 'By Location', icon: Calendar },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                  viewMode === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {summaryLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : viewMode === 'summary' ? (
            <ValuationSummaryView history={history} />
          ) : viewMode === 'category' ? (
            <CategoryBreakdown data={byCategory} totalValue={valuationData.total_value} />
          ) : (
            <LocationBreakdown data={byLocation} totalValue={valuationData.total_value} />
          )}
        </div>
      </div>
    </div>
  )
}

function ValueCard({
  label,
  value,
  subValue,
  icon,
  color,
}: {
  label: string
  value: string
  subValue?: string
  icon: React.ReactNode
  color: 'blue' | 'red' | 'green' | 'purple'
}) {
  const bgColors = {
    blue: 'bg-blue-50 border-blue-100',
    red: 'bg-red-50 border-red-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
  }

  return (
    <div className={cn('rounded-xl border p-5', bgColors[color])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subValue && <p className="text-sm text-gray-500 mt-1">{subValue}</p>}
        </div>
        {icon}
      </div>
    </div>
  )
}

function ValuationSummaryView({ history }: { history: any[] }) {
  const chartData = history.map(h => ({
    date: h.date,
    'Total Value': h.total_value || 0,
    'Cost': h.total_cost || 0,
  }))

  const valueFormatter = (number: number) => formatCurrency(number)

  return (
    <div className="space-y-6">
      <h3 className="font-medium">Valuation Trend (Last 30 Days)</h3>
      {history.length > 0 ? (
        <AreaChart
          className="h-72"
          data={chartData}
          index="date"
          categories={['Total Value', 'Cost']}
          colors={['blue', 'cyan']}
          valueFormatter={valueFormatter}
          showLegend={true}
          showGridLines={true}
          showAnimation={true}
          curveType="monotone"
        />
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400">
          No historical data available
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
        <div>
          <p className="text-sm text-gray-500">Method Used</p>
          <p className="font-medium capitalize">Weighted Average Cost</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Last Updated</p>
          <p className="font-medium">{new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  )
}

function CategoryBreakdown({ data, totalValue }: { data: ValuationByCategory[], totalValue: number }) {
  const chartData = data.map(cat => ({
    name: cat.category_name,
    value: cat.total_value,
  }))

  const chartColors: ('blue' | 'emerald' | 'amber' | 'violet' | 'pink' | 'indigo' | 'rose' | 'orange')[] = [
    'blue', 'emerald', 'amber', 'violet', 'pink', 'indigo', 'rose', 'orange'
  ]

  const valueFormatter = (number: number) => formatCurrency(number)

  return (
    <div className="space-y-6">
      <h3 className="font-medium">Inventory Value by Category</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No category data available</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donut Chart */}
            <div className="flex flex-col items-center">
              <DonutChart
                className="h-60"
                data={chartData}
                category="value"
                index="name"
                valueFormatter={valueFormatter}
                colors={chartColors.slice(0, data.length)}
                showAnimation={true}
                showLabel={true}
                label={formatCurrency(totalValue)}
              />
              <p className="text-sm text-gray-500 mt-2">Total Inventory Value</p>
            </div>

            {/* Bar Chart */}
            <BarChart
              className="h-60"
              data={chartData}
              index="name"
              categories={['value']}
              colors={['blue']}
              valueFormatter={valueFormatter}
              showAnimation={true}
              layout="vertical"
            />
          </div>

          {/* Table */}
          <table className="min-w-full divide-y divide-gray-200 mt-6">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.map((cat) => (
                <tr key={cat.category_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{cat.category_name}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(cat.total_units)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(cat.total_value)}</td>
                  <td className="px-4 py-3 text-right">
                    <Flex className="gap-2">
                      <ProgressBar value={cat.percent_of_total} color="blue" className="w-20" />
                      <span>{cat.percent_of_total.toFixed(1)}%</span>
                    </Flex>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(cat.avg_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function LocationBreakdown({ data, totalValue }: { data: ValuationByLocation[], totalValue: number }) {
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Inventory Value by Location</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No location data available</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((loc) => (
              <tr key={loc.location_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{loc.location_name}</td>
                <td className="px-4 py-3 text-right">{formatNumber(loc.total_units)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(loc.total_value)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${loc.percent_of_total}%` }}
                      />
                    </div>
                    <span>{loc.percent_of_total.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
