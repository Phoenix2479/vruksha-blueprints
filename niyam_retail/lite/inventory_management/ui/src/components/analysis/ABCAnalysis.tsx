import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Target, TrendingUp, Package, Download, Loader2, RefreshCw,
  ChevronDown, ChevronUp, Filter
} from 'lucide-react'
import {
  BarChart,
  DonutChart,
  AreaChart,
  Tracker,
  ProgressBar,
} from '@tremor/react'
import { analysisApi } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import type { ABCAnalysis as ABCAnalysisType, ABCItem } from '@/types/inventory'

export default function ABCAnalysis() {
  const [period, setPeriod] = useState<string>('90d')
  const [criteria, setCriteria] = useState<string>('revenue')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'rank' | 'revenue' | 'quantity'>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['abc-analysis', period, criteria],
    queryFn: () => analysisApi.getABC({ period, criteria }),
  })

  const analysis: ABCAnalysisType = data || {
    summary: {
      a_items: 0, a_value: 0, a_percent: 0,
      b_items: 0, b_value: 0, b_percent: 0,
      c_items: 0, c_value: 0, c_percent: 0,
    },
    items: [],
  }

  const filteredItems = categoryFilter === 'all'
    ? analysis.items
    : analysis.items.filter(i => i.category === categoryFilter)

  const sortedItems = [...filteredItems].sort((a, b) => {
    const multiplier = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'rank') return (a.rank - b.rank) * multiplier
    if (sortBy === 'revenue') return (a.revenue - b.revenue) * multiplier
    return (a.quantity_sold - b.quantity_sold) * multiplier
  })

  const toggleSort = (field: 'rank' | 'revenue' | 'quantity') => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const categoryColors = {
    A: 'bg-green-100 text-green-700 border-green-200',
    B: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    C: 'bg-red-100 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="180d">Last 6 Months</option>
            <option value="365d">Last Year</option>
          </select>
          <select
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="revenue">By Revenue</option>
            <option value="quantity">By Quantity Sold</option>
            <option value="profit">By Profit Margin</option>
          </select>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <CategoryCard
          category="A"
          label="High Value Items"
          description="Top 20% driving 80% of value"
          items={analysis.summary.a_items}
          value={analysis.summary.a_value}
          percent={analysis.summary.a_percent}
          active={categoryFilter === 'A'}
          onClick={() => setCategoryFilter(categoryFilter === 'A' ? 'all' : 'A')}
        />
        <CategoryCard
          category="B"
          label="Medium Value Items"
          description="Next 30% driving 15% of value"
          items={analysis.summary.b_items}
          value={analysis.summary.b_value}
          percent={analysis.summary.b_percent}
          active={categoryFilter === 'B'}
          onClick={() => setCategoryFilter(categoryFilter === 'B' ? 'all' : 'B')}
        />
        <CategoryCard
          category="C"
          label="Low Value Items"
          description="Bottom 50% driving 5% of value"
          items={analysis.summary.c_items}
          value={analysis.summary.c_value}
          percent={analysis.summary.c_percent}
          active={categoryFilter === 'C'}
          onClick={() => setCategoryFilter(categoryFilter === 'C' ? 'all' : 'C')}
        />
      </div>

      {/* Visual Breakdown with Tremor Charts */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium mb-4">Distribution Overview</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Donut Chart */}
          <div className="flex flex-col items-center">
            <DonutChart
              className="h-52"
              data={[
                { name: 'Category A', value: analysis.summary.a_value },
                { name: 'Category B', value: analysis.summary.b_value },
                { name: 'Category C', value: analysis.summary.c_value },
              ]}
              category="value"
              index="name"
              valueFormatter={(number) => formatCurrency(number)}
              colors={['emerald', 'amber', 'rose']}
              showAnimation={true}
              showLabel={true}
            />
            <p className="text-sm text-gray-500 mt-2">Value Distribution</p>
          </div>

          {/* Bar Chart - Items Count */}
          <BarChart
            className="h-52"
            data={[
              { category: 'A - High Value', items: analysis.summary.a_items, value: analysis.summary.a_value },
              { category: 'B - Medium', items: analysis.summary.b_items, value: analysis.summary.b_value },
              { category: 'C - Low Value', items: analysis.summary.c_items, value: analysis.summary.c_value },
            ]}
            index="category"
            categories={['items']}
            colors={['blue']}
            valueFormatter={(number) => `${number} items`}
            showAnimation={true}
          />
        </div>

        {/* Tracker visualization */}
        <div className="mt-6">
          <p className="text-sm text-gray-500 mb-2">Value Contribution by Category</p>
          <Tracker
            data={[
              ...Array(Math.round(analysis.summary.a_percent / 5) || 1).fill({ color: 'emerald', tooltip: 'Category A' }),
              ...Array(Math.round(analysis.summary.b_percent / 5) || 1).fill({ color: 'amber', tooltip: 'Category B' }),
              ...Array(Math.round(analysis.summary.c_percent / 5) || 1).fill({ color: 'rose', tooltip: 'Category C' }),
            ]}
            className="mt-2"
          />
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span className="text-emerald-600 font-medium">A: {analysis.summary.a_percent.toFixed(0)}% ({analysis.summary.a_items} items)</span>
            <span className="text-amber-600 font-medium">B: {analysis.summary.b_percent.toFixed(0)}% ({analysis.summary.b_items} items)</span>
            <span className="text-rose-600 font-medium">C: {analysis.summary.c_percent.toFixed(0)}% ({analysis.summary.c_items} items)</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-medium">
            {categoryFilter === 'all' ? 'All Items' : `Category ${categoryFilter} Items`}
            <span className="text-gray-500 font-normal ml-2">
              ({sortedItems.length} items)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            No items in this category
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('rank')}
                >
                  <div className="flex items-center gap-1">
                    Rank
                    {sortBy === 'rank' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Category</th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('revenue')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Revenue
                    {sortBy === 'revenue' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('quantity')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Qty Sold
                    {sortBy === 'quantity' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedItems.map((item) => (
                <tr key={item.product_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium">
                      {item.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">{item.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-3 py-1 text-sm font-bold rounded-full',
                      categoryColors[item.category]
                    )}>
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(item.revenue)}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(item.quantity_sold)}</td>
                  <td className="px-6 py-4 text-right">{item.percent_of_revenue.toFixed(2)}%</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            item.category === 'A' ? 'bg-green-500' :
                            item.category === 'B' ? 'bg-yellow-500' : 'bg-red-500'
                          )}
                          style={{ width: `${Math.min(item.cumulative_percent, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm">{item.cumulative_percent.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium mb-4">Recommendations</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-800 mb-2">Category A Items</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• Maintain safety stock levels</li>
              <li>• Negotiate better supplier terms</li>
              <li>• Monitor closely for stockouts</li>
              <li>• Consider premium placement</li>
            </ul>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="font-medium text-yellow-800 mb-2">Category B Items</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Review periodically</li>
              <li>• Standard reorder procedures</li>
              <li>• Look for upgrade opportunities</li>
              <li>• Bundle with A items</li>
            </ul>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <h4 className="font-medium text-red-800 mb-2">Category C Items</h4>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• Review for discontinuation</li>
              <li>• Reduce inventory levels</li>
              <li>• Consider clearance sales</li>
              <li>• Simplify ordering process</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoryCard({
  category,
  label,
  description,
  items,
  value,
  percent,
  active,
  onClick,
}: {
  category: 'A' | 'B' | 'C'
  label: string
  description: string
  items: number
  value: number
  percent: number
  active?: boolean
  onClick: () => void
}) {
  const colors = {
    A: 'border-green-200 bg-green-50',
    B: 'border-yellow-200 bg-yellow-50',
    C: 'border-red-200 bg-red-50',
  }

  const textColors = {
    A: 'text-green-700',
    B: 'text-yellow-700',
    C: 'text-red-700',
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 p-5 cursor-pointer transition-all hover:shadow-md',
        colors[category],
        active && 'ring-2 ring-blue-500'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-3xl font-bold', textColors[category])}>{category}</span>
        <span className={cn('text-sm font-medium px-2 py-1 rounded', colors[category], textColors[category])}>
          {percent.toFixed(0)}% of value
        </span>
      </div>
      <h4 className="font-medium mb-1">{label}</h4>
      <p className="text-sm text-gray-500 mb-3">{description}</p>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{formatNumber(items)} items</span>
        <span className="font-medium">{formatCurrency(value)}</span>
      </div>
    </div>
  )
}
