import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInsightsApi, type Insight, type Prediction, type AIStats } from '../api/aiInsightsApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Badge, Progress } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard } from '../../../../shared/components/blocks';
import { Brain, Lightbulb, AlertTriangle, TrendingUp, Target, Zap, CheckCircle, X, ChevronRight } from 'lucide-react';

const CURRENCY = 'INR';

export default function AIInsightsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('insights');
  const [filterType, setFilterType] = useState<string>('all');

  const { data: stats } = useQuery<AIStats>({ queryKey: ['ai-stats'], queryFn: aiInsightsApi.getStats });
  const { data: insights = [], isLoading } = useQuery({ queryKey: ['insights', filterType], queryFn: () => aiInsightsApi.getInsights({ type: filterType !== 'all' ? filterType as Insight['type'] : undefined }) });
  const { data: predictions = [] } = useQuery<Prediction[]>({ queryKey: ['predictions'], queryFn: aiInsightsApi.getPredictions });

  const dismissMutation = useMutation({ mutationFn: aiInsightsApi.dismissInsight, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights'] }) });
  const applyMutation = useMutation({ mutationFn: aiInsightsApi.applyRecommendation, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights'] }) });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const highImpact = insights.filter(i => i.impact === 'high');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Brain className="h-7 w-7 text-violet-600" />
            <div><h1 className="text-xl font-bold">AI Insights</h1><p className="text-sm text-muted-foreground">Intelligent recommendations & predictions</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Insights" value={`${stats?.totalInsights || 0}`} icon={Lightbulb} iconColor="text-violet-600" iconBgColor="bg-violet-100" />
          <StatsCard title="High Impact" value={`${stats?.highImpact || 0}`} icon={Zap} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
          <StatsCard title="Actionable" value={`${stats?.actionable || 0}`} icon={Target} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
          <StatsCard title="Model Accuracy" value={`${((stats?.accuracy || 0) * 100).toFixed(0)}%`} icon={Brain} iconColor="text-green-600" iconBgColor="bg-green-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="insights">Insights ({insights.length})</TabsTrigger>
            <TabsTrigger value="predictions">Predictions</TabsTrigger>
            <TabsTrigger value="high-impact">High Impact ({highImpact.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="mt-6">
            <div className="space-y-4">
              <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="opportunity">Opportunities</SelectItem><SelectItem value="warning">Warnings</SelectItem><SelectItem value="recommendation">Recommendations</SelectItem><SelectItem value="trend">Trends</SelectItem></SelectContent></Select>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32 w-full" /></CardContent></Card>) : insights.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No insights available</CardContent></Card> : insights.map(i => <InsightCard key={i.id} insight={i} onDismiss={() => dismissMutation.mutate(i.id)} onApply={() => applyMutation.mutate(i.id)} />)}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="predictions" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {predictions.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No predictions</CardContent></Card> : predictions.map(p => (
                <Card key={p.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <h3 className="font-medium">{p.title}</h3>
                      <Badge variant="outline">{p.type}</Badge>
                    </div>
                    <div className="mt-4">
                      <p className="text-2xl font-bold">{p.type === 'revenue' ? formatPrice(p.predictedValue) : p.predictedValue.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">{p.timeframe}</p>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-sm"><span>Confidence</span><span className="font-medium">{(p.confidence * 100).toFixed(0)}%</span></div>
                      <Progress value={p.confidence * 100} className="h-2" />
                    </div>
                    {p.factors.length > 0 && (<div className="mt-3"><p className="text-xs text-muted-foreground mb-1">Key Factors:</p><div className="flex flex-wrap gap-1">{p.factors.slice(0, 3).map(f => <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>)}</div></div>)}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="high-impact" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {highImpact.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No high impact insights</CardContent></Card> : highImpact.map(i => <InsightCard key={i.id} insight={i} onDismiss={() => dismissMutation.mutate(i.id)} onApply={() => applyMutation.mutate(i.id)} />)}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function InsightCard({ insight, onDismiss, onApply }: { insight: Insight; onDismiss: () => void; onApply: () => void }) {
  const Icon = { opportunity: TrendingUp, warning: AlertTriangle, recommendation: Lightbulb, trend: TrendingUp }[insight.type];
  const colors = { opportunity: 'text-green-600 bg-green-100', warning: 'text-amber-600 bg-amber-100', recommendation: 'text-blue-600 bg-blue-100', trend: 'text-purple-600 bg-purple-100' }[insight.type];
  const impactColors = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-gray-100 text-gray-800' };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${colors}`}><Icon className="h-5 w-5" /></div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <h3 className="font-medium">{insight.title}</h3>
              <Badge className={impactColors[insight.impact]}>{insight.impact}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
            {insight.suggestedAction && (<div className="mt-3 p-2 bg-muted/50 rounded text-sm flex items-center gap-2"><ChevronRight className="h-4 w-4 text-muted-foreground" />{insight.suggestedAction}</div>)}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span></div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onDismiss}><X className="h-3 w-3" /></Button>
                {insight.actionable && <Button size="sm" onClick={onApply}><CheckCircle className="h-3 w-3 mr-1" /> Apply</Button>}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
