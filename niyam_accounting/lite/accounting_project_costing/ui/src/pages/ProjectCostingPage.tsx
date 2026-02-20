import { useState } from 'react'
import { FolderOpen, Plus, BarChart3, CheckCircle, XCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useProjects, useSummary } from '@/hooks/useData'

interface SidebarItem { id: string; label: string; icon: React.ComponentType<{className?:string}> }
interface SidebarGroup { label: string; items: SidebarItem[] }

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Projects',
    items: [
      { id: 'projects', label: 'All Projects', icon: FolderOpen },
      { id: 'create', label: 'New Project', icon: Plus },
      { id: 'summary', label: 'Summary', icon: BarChart3 },
    ],
  }
]

export function ProjectCostingPage() {
  const [activeTab, setActiveTab] = useState(sidebarGroups[0].items[0].id)
  const [collapsed, setCollapsed] = useState(false)

  const { data: projectsData } = useProjects()
  const { data: summaryData } = useSummary()

  const currentItem = sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)

  function renderContent() {
    switch (activeTab) {
      case 'projects': {
        const rows = Array.isArray(projectsData?.data) ? projectsData.data : (projectsData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">code</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">budget</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">status</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">billing type</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.code ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.budget ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.status ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.billing_type ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      case 'create': return <div className="p-6"><Card><CardContent className="p-6 text-center text-muted-foreground">Use the API to create a new project</CardContent></Card></div>
      case 'summary': {
        const rows = Array.isArray(summaryData?.data) ? summaryData.data : (summaryData?.data?.items || [])
        return (
          <div className="p-6"><Card><CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50"><tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">code</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">name</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">budget</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total cost</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">total revenue</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">profit</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30">
              <td className="p-3 text-sm">{String(row.code ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.name ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.budget ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_cost ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.total_revenue ?? '-')}</td>
              <td className="p-3 text-sm">{String(row.profit ?? '-')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent></Card></div>
        )
      }
      default: return <div className="p-6 text-muted-foreground">Select an item from the sidebar</div>
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`flex flex-col border-r bg-card transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className="h-14 border-b flex items-center justify-between px-3">
          {!collapsed && <span className="font-semibold text-sm">Project Costing</span>}
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
            <h1 className="text-lg font-semibold">{currentItem?.label || 'Project Costing'}</h1>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
