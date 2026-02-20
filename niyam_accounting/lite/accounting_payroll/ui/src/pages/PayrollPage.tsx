import { useState } from 'react'
import { Users, Layers, Play, BarChart3, Settings, CheckCircle, XCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useEmployees, useStructures, useRuns, useSummary, useSettings } from '@/hooks/useData'

interface SidebarItem { id: string; label: string; icon: React.ComponentType<{className?:string}> }
interface SidebarGroup { label: string; items: SidebarItem[] }

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'People',
    items: [
      { id: 'employees', label: 'Employees', icon: Users },
      { id: 'structures', label: 'Salary Structures', icon: Layers },
    ],
  },
  {
    label: 'Payroll',
    items: [
      { id: 'runs', label: 'Payroll Runs', icon: Play },
      { id: 'summary', label: 'Summary', icon: BarChart3 },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'settings', label: 'PF / ESI / TDS', icon: Settings },
    ],
  }
]

export function PayrollPage() {
  const [activeTab, setActiveTab] = useState(sidebarGroups[0].items[0].id)
  const [collapsed, setCollapsed] = useState(false)

  const { data: employeesData } = useEmployees()
  const { data: structuresData } = useStructures()
  const { data: runsData } = useRuns()
  const { data: summaryData } = useSummary()
  const { data: settingsData } = useSettings()

  const currentItem = sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)

  function renderContent() {
    switch (activeTab) {
      case 'employees': {
        const rows = Array.isArray(employeesData?.data) ? employeesData.data : (employeesData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">emp code</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">department</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">designation</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">gross salary</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">status</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.emp_code ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.department ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.designation ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.gross_salary ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.status ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'structures': {
        const rows = Array.isArray(structuresData?.data) ? structuresData.data : (structuresData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">basic pct</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">hra pct</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">da pct</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">pf employer pct</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.basic_pct ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.hra_pct ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.da_pct ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.pf_employer_pct ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'runs': {
        const rows = Array.isArray(runsData?.data) ? runsData.data : (runsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">run number</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">period month</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">period year</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total gross</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total net</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">status</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.run_number ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.period_month ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.period_year ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_gross ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_net ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.status ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'summary': return <div className="p-6"><Card><CardContent className="p-6"><pre className="text-sm text-muted-foreground overflow-auto">{JSON.stringify(summaryData?.data, null, 2)}</pre></CardContent></Card></div>
      case 'settings': return <div className="p-6"><Card><CardContent className="p-6"><pre className="text-sm text-muted-foreground overflow-auto">{JSON.stringify(settingsData?.data, null, 2)}</pre></CardContent></Card></div>
      default: return <div className="p-6 text-muted-foreground">Select an item from the sidebar</div>
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`flex flex-col border-r bg-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className="h-14 border-b flex items-center justify-between px-3">
          {!collapsed && <span className="font-semibold text-sm">Payroll</span>}
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
            <h1 className="text-lg font-semibold">{currentItem?.label || 'Payroll'}</h1>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
