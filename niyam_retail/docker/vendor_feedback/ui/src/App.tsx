import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, RefreshCw, CheckCircle, XCircle, Plus, Loader2 } from 'lucide-react'
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

  const tabs = ["Dashboard","Feedback"]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Star className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Vendor Feedback</h1>
                <p className="text-sm text-gray-500">Supplier ratings and feedback management</p>
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
                  activeTab === tab ? 'border-yellow-500 text-yellow-600' :
                  'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'Dashboard' && <DashboardView />}
        
        {activeTab === 'Feedback' && <FeedbackView />}
        
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
        <StatsCard label="Service" value="Vendor Feedback" />
      </div>
      
    </div>
  )
}


function FeedbackView() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['/feedback'],
    queryFn: () => api.get('/feedback').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/feedback', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/feedback'] })
      setShowForm(false)
    },
  })

  const items = Array.isArray(data) ? data : data?.items|| data?.items|| []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Feedback</h2>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
          <Plus className="h-4 w-4" /> Add Feedback
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-medium mb-4">New Feedback</h3>
          <EntityForm
            fields={[{"name":"vendor_id","label":"Vendor ID","type":"text","required":true},{"name":"rating","label":"Rating","type":"rating","required":true},{"name":"delivery_rating","label":"Delivery Rating","type":"rating"},{"name":"quality_rating","label":"Quality Rating","type":"rating"},{"name":"comment","label":"Comment","type":"textarea"}]}
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
            isLoading={createMutation.isPending}
          />
        </div>
      )}

      <DataTable
        columns={["vendor_id","rating","delivery_rating","quality_rating","created_at"]}
        data={items}
        isLoading={isLoading}
      />
    </div>
  )
}


