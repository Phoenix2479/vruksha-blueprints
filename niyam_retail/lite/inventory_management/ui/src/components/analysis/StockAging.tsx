import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, AlertTriangle, Calendar, Download, Loader2, RefreshCw,
  ChevronRight, Package
} from 'lucide-react'
import {
  BarChart,
  DonutChart,
  Tracker,
  ProgressCircle,
  Card,
  Metric,
  Text,
} from '@tremor/react'
import { analysisApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatDate, cn } from '@/lib/utils'
import type { StockAgingBracket, StockAgingItem } from '@/types/inventory'

export default function StockAging() {
  const [selectedBracket, setSelectedBracket] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-aging'],
    queryFn: () => analysisApi.getAging(),
  })

  const brackets: StockAgingBracket[] = data?.brackets || []
  const items: StockAgingItem[] = data?.items || []
  const summary = data?.summary || { total_value: 0, avg_age: 0 }

  const filteredItems = selectedBracket
    ? items.filter(i => i.bracket === selectedBracket)
    : items

  const bracketColors: Record<string, string> = {
    '0-30': 'bg-green-500',
    '31-60': 'bg-lime-500',
    '61-90': 'bg-yellow-500',
    '91-120': 'bg-orange-500',
    '121-180': 'bg-red-400',
    '180+': 'bg-red-600',
  }

  const bracketBgColors: Record<string, string> = {
    '0-30': 'bg-green-50 border-green-200 hover:bg-green-100',
    '31-60': 'bg-lime-50 border-lime-200 hover:bg-lime-100',
    '61-90': 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
    '91-120': 'bg-orange-50 border-orange-200 hover:bg-orange-100',
    '121-180': 'bg-red-50 border-red-200 hover:bg-red-100',
    '180+': 'bg-red-100 border-red-300 hover:bg-red-200',
  }

  const totalValue = brackets.reduce((sum, b) => sum + b.total_value, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stock Aging Report</h2>
          <p className="text-sm text-gray-500">Analyze inventory by age since receipt</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="h-5 w-5 text-gray-500" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Inventory Value</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.total_value)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Average Age</p>
              <p className="text-2xl font-bold">{Math.round(summary.avg_age)} days</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Old Stock (90+ days)</p>
              <p className="text-2xl font-bold">
                {formatCurrency(
                  brackets
                    .filter(b => b.min_days >= 90)
                    .reduce((sum, b) => sum + b.total_value, 0)
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Distribution with Tremor Charts */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-medium mb-4">Value Distribution by Age</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
          {/* Bar Chart */}
          <BarChart
            className="h-60"
            data={brackets.map(b => ({
              bracket: b.bracket + ' days',
              Value: b.total_value,
              Items: b.item_count,
            }))}
            index="bracket"
            categories={['Value']}
            colors={['blue']}
            valueFormatter={(number) => formatCurrency(number)}
            showAnimation={true}
          />

          {/* Donut Chart */}
          <div className="flex flex-col items-center">
            <DonutChart
              className="h-52"
              data={brackets.map(b => ({
                name: b.bracket + ' days',
                value: b.total_value,
              }))}
              category="value"
              index="name"
              valueFormatter={(number) => formatCurrency(number)}
              colors={['emerald', 'lime', 'amber', 'orange', 'rose', 'red']}
              showAnimation={true}
              showLabel={true}
              label={formatCurrency(totalValue)}
            />
            <p className="text-sm text-gray-500 mt-2">Total by Age Bracket</p>
          </div>
        </div>

        {/* Tracker visualization */}
        <div>
          <p className="text-sm text-gray-500 mb-2">Stock Health Overview</p>
          <Tracker
            data={brackets.flatMap(b => {
              const count = Math.max(1, Math.round(b.percent_of_value / 5))
              const colorMap: Record<string, 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'red'> = {
                '0-30': 'emerald',
                '31-60': 'lime',
                '61-90': 'amber',
                '91-120': 'orange',
                '121-180': 'rose',
                '180+': 'red',
              }
              return Array(count).fill({ 
                color: colorMap[b.bracket] || 'gray', 
                tooltip: `${b.bracket} days: ${formatCurrency(b.total_value)}` 
              })
            })}
            className="mt-2"
          />
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span className="text-emerald-600">Fresh (0-30 days)</span>
            <span className="text-red-600">Old (180+ days)</span>
          </div>
        </div>
      </div>

      {/* Brackets Grid */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {brackets.map((bracket) => (
          <div
            key={bracket.bracket}
            onClick={() => setSelectedBracket(selectedBracket === bracket.bracket ? null : bracket.bracket)}
            className={cn(
              'rounded-xl border-2 p-4 cursor-pointer transition-all',
              bracketBgColors[bracket.bracket] || 'bg-gray-50 border-gray-200',
              selectedBracket === bracket.bracket && 'ring-2 ring-blue-500'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{bracket.bracket} days</span>
              <ChevronRight className={cn(
                'h-4 w-4 transition-transform',
                selectedBracket === bracket.bracket && 'rotate-90'
              )} />
            </div>
            <p className="text-xl font-bold">{formatNumber(bracket.item_count)}</p>
            <p className="text-xs text-gray-500">items</p>
            <p className="text-sm font-medium mt-2">{formatCurrency(bracket.total_value)}</p>
            <p className="text-xs text-gray-500">{bracket.percent_of_value.toFixed(1)}% of total</p>
          </div>
        ))}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-medium">
            {selectedBracket ? `Items Aged ${selectedBracket} Days` : 'All Items by Age'}
            <span className="text-gray-500 font-normal ml-2">
              ({filteredItems.length} items)
            </span>
          </h3>
          {selectedBracket && (
            <button
              onClick={() => setSelectedBracket(null)}
              className="text-sm text-blue-600 hover:underline"
            >
              Show all
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            No items in this age bracket
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Age (Days)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt Date</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bracket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.slice(0, 50).map((item, i) => (
                <tr key={`${item.product_id}-${i}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{item.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(item.quantity)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(item.value)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      'font-medium',
                      item.age_days > 180 ? 'text-red-600' :
                      item.age_days > 90 ? 'text-orange-600' :
                      item.age_days > 60 ? 'text-yellow-600' : 'text-green-600'
                    )}>
                      {item.age_days}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(item.receipt_date)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full',
                      bracketBgColors[item.bracket]?.replace('hover:bg-', 'bg-') || 'bg-gray-100'
                    )}>
                      {item.bracket}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filteredItems.length > 50 && (
          <div className="px-6 py-3 bg-gray-50 border-t text-center text-sm text-gray-500">
            Showing first 50 of {filteredItems.length} items
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium mb-4">Aging Recommendations</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <Clock className="h-5 w-5 text-green-600 mb-2" />
            <h4 className="font-medium text-green-800">Fresh Stock (0-60 days)</h4>
            <p className="text-sm text-green-700 mt-1">
              Maintain current inventory practices. These items are moving well.
            </p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mb-2" />
            <h4 className="font-medium text-yellow-800">Aging Stock (61-120 days)</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Consider promotional activities or bundling to accelerate movement.
            </p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <Calendar className="h-5 w-5 text-red-600 mb-2" />
            <h4 className="font-medium text-red-800">Old Stock (120+ days)</h4>
            <p className="text-sm text-red-700 mt-1">
              Review for clearance, return to vendor, or write-off. Capital is at risk.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
