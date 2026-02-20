import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PrintJob } from '@/types/barcode'
import { 
  Button, 
  Badge,
  Card,
  CardContent,
} from '@shared/components/ui'
import { DataTable, EmptyState, type Column } from '@shared/components/blocks'
import { History, Printer, FileText, Calendar, Package, Layers } from 'lucide-react'

export default function PrintHistoryTab() {
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: () => api.get('/api/print-jobs', { params: { limit: 100 } }).then(r => r.data),
  })

  const printJobs: PrintJob[] = jobsData?.printJobs || []

  // Calculate stats
  const totalJobs = printJobs.length
  const totalLabels = printJobs.reduce((sum, job) => sum + (job.totalLabels || 0), 0)
  const todayJobs = printJobs.filter(job => {
    const jobDate = new Date(job.createdAt)
    const today = new Date()
    return jobDate.toDateString() === today.toDateString()
  }).length

  const columns: Column<PrintJob>[] = [
    {
      id: 'date',
      header: 'Date & Time',
      cell: (row) => {
        const date = new Date(row.createdAt)
        return (
          <div>
            <p className="font-medium">
              {date.toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {date.toLocaleTimeString('en-IN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          </div>
        )
      },
    },
    {
      id: 'template',
      header: 'Template',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className={row.templateName ? '' : 'text-muted-foreground italic'}>
            {row.templateName || 'Deleted Template'}
          </span>
        </div>
      ),
    },
    {
      id: 'products',
      header: 'Products',
      headerClassName: 'text-center',
      className: 'text-center',
      cell: (row) => (
        <Badge variant="outline">
          <Package className="h-3 w-3 mr-1" />
          {row.productIds?.length || 0}
        </Badge>
      ),
    },
    {
      id: 'copies',
      header: 'Copies',
      headerClassName: 'text-center',
      className: 'text-center',
      cell: (row) => (
        <span className="text-muted-foreground">
          ×{row.copiesPerProduct || 1}
        </span>
      ),
    },
    {
      id: 'labels',
      header: 'Total Labels',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (row) => (
        <Badge variant="secondary" className="font-mono">
          <Layers className="h-3 w-3 mr-1" />
          {row.totalLabels}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <Button variant="ghost" size="sm" title="Reprint">
          <Printer className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Print History</h2>
        <p className="text-sm text-muted-foreground">
          View and manage your label print jobs
        </p>
      </div>

      {/* Stats Cards */}
      {printJobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Printer className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalJobs}</p>
                <p className="text-xs text-muted-foreground">Total Print Jobs</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100">
                <Layers className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalLabels.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Labels Printed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayJobs}</p>
                <p className="text-xs text-muted-foreground">Printed Today</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Print Jobs Table */}
      <DataTable
        data={printJobs}
        columns={columns}
        isLoading={isLoading}
        pagination
        pageSize={15}
        emptyState={
          <EmptyState
            icon={History}
            title="No print history"
            description="Print jobs will appear here after you print labels"
          />
        }
      />
    </div>
  )
}
