import { useQuery } from '@tanstack/react-query';
import { qualityApi, type Batch, type Defect, type QualityMetrics } from '../api/qualityApi';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '../../../../shared/components/ui';
import { ClipboardCheck, AlertTriangle, CheckCircle } from 'lucide-react';

export default function QualityControlPage() {
  
  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: qualityApi.getBatches });
  const { data: defects = [] } = useQuery({ queryKey: ['defects'], queryFn: qualityApi.getDefects });
  const { data: metrics } = useQuery<QualityMetrics>({ queryKey: ['quality-metrics'], queryFn: qualityApi.getQualityMetrics });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold">Quality Control</h1>
              <p className="text-sm text-muted-foreground">Track batches and defects</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Defect Rate</p>
                    <p className="text-2xl font-bold">{(metrics.defect_rate * 100).toFixed(2)}%</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">First Pass Yield</p>
                    <p className="text-2xl font-bold">{(metrics.first_pass_yield * 100).toFixed(1)}%</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Rejection Rate</p>
                    <p className="text-2xl font-bold">{(metrics.rejection_rate * 100).toFixed(2)}%</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Compliance Score</p>
                    <p className="text-2xl font-bold">{metrics.compliance_score.toFixed(1)}</p>
                  </div>
                  <ClipboardCheck className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Batches ({batches.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {batches.slice(0, 5).map((batch: Batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">{batch.batch_number}</p>
                      <p className="text-sm text-muted-foreground">Qty: {batch.quantity}</p>
                    </div>
                    <Badge variant={batch.status === 'released' ? 'default' : 'secondary'}>
                      {batch.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Defects ({defects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {defects.slice(0, 5).map((defect: Defect) => (
                  <div key={defect.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">{defect.description}</p>
                      <p className="text-sm text-muted-foreground">{new Date(defect.reported_at).toLocaleDateString()}</p>
                    </div>
                    <Badge variant={defect.type === 'critical' ? 'destructive' : 'secondary'}>
                      {defect.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
