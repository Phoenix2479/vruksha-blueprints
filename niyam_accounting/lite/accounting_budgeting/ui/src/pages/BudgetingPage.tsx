import { useState } from 'react'
import { FileStack, Plus, TrendingUp, Bell, FileText, CheckCircle, XCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useVersions, useForecast, useAlerts, useReports } from '@/hooks/useData'

interface SidebarItem { id: string; label: string; icon: React.ComponentType<{className?:string}> }
interface SidebarGroup { label: string; items: SidebarItem[] }

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Budgets',
    items: [
      { id: 'versions', label: 'Budget Versions', icon: FileStack },
      { id: 'create', label: 'New Budget', icon: Plus },
      { id: 'forecast', label: 'Forecast', icon: TrendingUp },
      { id: 'alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    label: 'Report Builder',
    items: [
      { id: 'reports', label: 'Saved Reports', icon: FileText },
      { id: 'new-report', label: 'New Report', icon: Plus },
    ],
  }
]

export function BudgetingPage() {
  const [activeTab, setActiveTab] = useState(sidebarGroups[0].items[0].id)
  const [collapsed, setCollapsed] = useState(false)

  const { data: versionsData } = useVersions()
  const { data: forecastData } = useForecast()
  const { data: alertsData } = useAlerts()
  const { data: reportsData } = useReports()

  const currentItem = sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)

  function renderContent() {
    switch (activeTab) {
      case 'versions': {
        const rows = Array.isArray(versionsData?.data) ? versionsData.data : (versionsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">fiscal year id</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">version</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">status</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">created at</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.fiscal_year_id ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.version ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.status ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.created_at ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'create': return <div className="p-6"><Card><CardContent className="p-6 text-center text-muted-foreground">Use the API to create a budget version</CardContent></Card></div>
      case 'forecast': {
        const rows = Array.isArray(forecastData?.data) ? forecastData.data : (forecastData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">period</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">budgeted</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">actual</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.period ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.budgeted ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.actual ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'alerts': {
        const rows = Array.isArray(alertsData?.data) ? alertsData.data : (alertsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">account name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">period</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">budgeted</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">actual</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">utilization pct</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">severity</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.account_name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.period ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.budgeted ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.actual ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.utilization_pct ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.severity ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'reports': {
        const rows = Array.isArray(reportsData?.data) ? reportsData.data : (reportsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">description</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">created by</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">is public</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">updated at</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.description ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.created_by ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.is_public ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.updated_at ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'new-report': return <div className="p-6"><Card><CardContent className="p-6 text-center text-muted-foreground">Use the API to build a custom report</CardContent></Card></div>
      default: return <div className="p-6 text-muted-foreground">Select an item from the sidebar</div>
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`flex flex-col border-r bg-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className="h-14 border-b flex items-center justify-between px-3">
          {!collapsed && <span className="font-semibold text-sm">Budgeting & Reports</span>}
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
            <h1 className="text-lg font-semibold">{currentItem?.label || 'Budgeting & Reports'}</h1>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
