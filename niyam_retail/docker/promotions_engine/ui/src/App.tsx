import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Percent, RefreshCw, CheckCircle, XCircle, Plus, Loader2 } from 'lucide-react'
import { DataTable } from '@/components/DataTable'
import { EntityForm } from '@/components/EntityForm'
import { StatsCard } from '@/components/StatsCard'
import { api } from '@/lib/api'

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: health, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/healthz').then(r => r.data),
    refetchInterval: 30000,
  })

  const tabs = ["Dashboard","Promotions","Actions"]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Percent className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Promotions Engine</h1>
                <p className="text-sm text-gray-500">Discounts, coupons, and promotional campaigns</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => refetch()} className="p-2 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="h-5 w-5 text-gray-500" />
              </button>
              <div className="flex items-center gap-2">
                {healthLoading ? <Loader2 className="h-5 w-5 animate-spin" /> :
                  health?.status === 'ok' ? <CheckCircle className="h-5 w-5 text-green-500" /> :
                  <XCircle className="h-5 w-5 text-red-500" />}
                <span className="text-sm">{health?.status || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab ? 'border-orange-500 text-orange-600' :
                  'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'Dashboard' && <DashboardView />}
        
        {activeTab === 'Promotions' && <PromotionView />}
        {activeTab === 'Actions' && <ActionsView />}
      </main>
    </div>
  )
}

function DashboardView() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats').then(r => r.data),
  })
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard label="Status" value={stats?.status || 'Active'} />
        <StatsCard label="Uptime" value={stats?.uptime ? `${Math.round(stats.uptime/60)}m` : '-'} />
        <StatsCard label="Service" value="Promotions Engine" />
      </div>
      
    </div>
  )
}


function PromotionView() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['/promotions'],
    queryFn: () => api.get('/promotions').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/promotions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/promotions'] })
      setShowForm(false)
    },
  })

  const items = Array.isArray(data) ? data : data?.items|| data?.items|| []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Promotions</h2>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
          <Plus className="h-4 w-4" /> Add Promotion
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-medium mb-4">New Promotion</h3>
          <EntityForm
            fields={[{"name":"code","label":"Promo Code","type":"text"},{"name":"name","label":"Name","type":"text","required":true},{"name":"description","label":"Description","type":"textarea"},{"name":"discount_type","label":"Discount Type","type":"select","options":["percentage","fixed"],"required":true},{"name":"discount_value","label":"Discount Value","type":"number","required":true},{"name":"min_purchase_amount","label":"Min Purchase","type":"number"},{"name":"max_discount_amount","label":"Max Discount","type":"number"},{"name":"start_date","label":"Start Date","type":"date","required":true},{"name":"end_date","label":"End Date","type":"date","required":true},{"name":"max_uses","label":"Max Uses","type":"number"},{"name":"active","label":"Active","type":"checkbox"}]}
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
            isLoading={createMutation.isPending}
          />
        </div>
      )}

      <DataTable
        columns={["code","name","discount_type","discount_value","active"]}
        data={items}
        isLoading={isLoading}
      />
    </div>
  )
}


function ActionsView() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const executeAction = async (action: { name: string, endpoint: string, method: string }) => {
    setLoading(action.name)
    try {
      const res = await api.request({ method: action.method, url: action.endpoint, data: {} })
      setResult({ action: action.name, success: true, data: res.data })
    } catch (err: any) {
      setResult({ action: action.name, success: false, error: err.message })
    }
    setLoading(null)
  }

  const actions = [{"name":"Validate Promo","endpoint":"/promotions/validate","method":"POST"}]

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((action: any) => (
          <button key={action.name} onClick={() => executeAction(action)}
            disabled={loading === action.name}
            className="p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow text-left">
            <div className="font-medium">{action.name}</div>
            {action.description && <p className="text-sm text-gray-500 mt-1">{action.description}</p>}
            {loading === action.name && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
          </button>
        ))}
      </div>
      {result && (
        <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
          <div className="font-medium">{result.action}: {result.success ? 'Success' : 'Failed'}</div>
          <pre className="text-sm mt-2 overflow-auto">{JSON.stringify(result.data || result.error, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
