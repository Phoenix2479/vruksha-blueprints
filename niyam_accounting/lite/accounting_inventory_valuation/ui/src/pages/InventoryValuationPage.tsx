import { useState } from 'react'
import { Package, ArrowRightLeft, Calculator, DollarSign, CheckCircle, XCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useValuation, useMethods } from '@/hooks/useData'

interface SidebarItem { id: string; label: string; icon: React.ComponentType<{className?:string}> }
interface SidebarGroup { label: string; items: SidebarItem[] }

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Inventory',
    items: [
      { id: 'valuation', label: 'Valuation', icon: Package },
      { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
    ],
  },
  {
    label: 'Costing',
    items: [
      { id: 'methods', label: 'Costing Methods', icon: Calculator },
      { id: 'calculate', label: 'COGS Calculator', icon: DollarSign },
    ],
  }
]

export function InventoryValuationPage() {
  const [activeTab, setActiveTab] = useState(sidebarGroups[0].items[0].id)
  const [collapsed, setCollapsed] = useState(false)

  const { data: valuationData } = useValuation()
  const { data: methodsData } = useMethods()

  const currentItem = sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)

  function renderContent() {
    switch (activeTab) {
      case 'valuation': {
        const rows = Array.isArray(valuationData?.data) ? valuationData.data : (valuationData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">product name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">valuation method</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">unit cost</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total qty</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total value</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.product_name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.valuation_method ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.unit_cost ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_qty ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_value ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'transactions': return <div className="p-6"><Card><CardContent className="p-6 text-center text-muted-foreground">Use the API to inventory movements</CardContent></Card></div>
      case 'methods': {
        const rows = Array.isArray(methodsData?.data) ? methodsData.data : (methodsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">description</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.description ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'calculate': return <div className="p-6"><Card><CardContent className="p-6 text-center text-muted-foreground">Use the API to calculate cost of goods sold</CardContent></Card></div>
      default: return <div className="p-6 text-muted-foreground">Select an item from the sidebar</div>
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`flex flex-col border-r bg-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className="h-14 border-b flex items-center justify-between px-3">
          {!collapsed && <span className="font-semibold text-sm">Inventory Valuation</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-md hover:bg-muted">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 py-2 overflow-auto">
          {sidebarGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
              {!collapsed && <h4 className="px-4 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h4>}
              <div className="space-y-0.5 px-2">
                {group.items.map(item => {
                  const Icon = item.icon
                  const active = activeTab === item.id
                  return (
                    <button key={item.id} onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${collapsed ? 'justify-center px-2' : ''}`}>
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b flex items-center px-6">
          <div>
            <h1 className="text-lg font-semibold">{currentItem?.label || 'Inventory Valuation'}</h1>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
