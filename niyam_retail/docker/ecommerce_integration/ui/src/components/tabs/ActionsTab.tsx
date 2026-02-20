import { api } from '@/lib/api'
import { useEcommerceStore } from '@/store/ecommerceStore'
import {
  Card,
  CardContent,
} from '@shared/components/ui'
import {
  Upload,
  Download,
  Package,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'

const ACTIONS = [
  {
    name: 'Sync Products',
    endpoint: '/sync/products',
    method: 'POST',
    description: 'Sync product catalog to marketplaces',
    icon: Upload,
    color: 'bg-blue-500/10 text-blue-600',
  },
  {
    name: 'Import Orders',
    endpoint: '/orders/import',
    method: 'POST',
    description: 'Import orders from marketplaces',
    icon: Download,
    color: 'bg-green-500/10 text-green-600',
  },
  {
    name: 'Sync Inventory',
    endpoint: '/sync/inventory',
    method: 'POST',
    description: 'Sync inventory levels',
    icon: Package,
    color: 'bg-purple-500/10 text-purple-600',
  },
]

export default function ActionsTab() {
  const { actionResult, actionLoading, setActionResult, setActionLoading } = useEcommerceStore()

  const executeAction = async (action: typeof ACTIONS[0]) => {
    setActionLoading(action.name)
    try {
      const res = await api.request({ 
        method: action.method, 
        url: action.endpoint, 
        data: {} 
      })
      setActionResult({ 
        action: action.name, 
        success: true, 
        data: res.data 
      })
    } catch (err: any) {
      setActionResult({ 
        action: action.name, 
        success: false, 
        error: err.message 
      })
    }
    setActionLoading(null)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACTIONS.map((action) => (
          <Card
            key={action.name}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => executeAction(action)}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${action.color}`}>
                  <action.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{action.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {action.description}
                  </p>
                </div>
                {actionLoading === action.name && (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {actionResult && (
        <Card className={
          actionResult.success 
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
        }>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {actionResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span className="font-medium">
                {actionResult.action}: {actionResult.success ? 'Success' : 'Failed'}
              </span>
            </div>
            <pre className="text-sm overflow-auto p-2 bg-background rounded">
              {JSON.stringify(actionResult.data || actionResult.error, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
