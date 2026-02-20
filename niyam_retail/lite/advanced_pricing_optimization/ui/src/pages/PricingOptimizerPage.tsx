import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pricingModelApi,
  dynamicPricingApi,
  priceHistoryApi,
  optimizationRulesApi,
  pricingStatsApi,
  productsApi,
  type PricingModel,
  type PriceCalculation,
  type OptimizationRule,
  type BulkPriceUpdate,
  type RuleCondition,
  type RuleAction,
} from '../api/pricingApi';
import { formatCurrency } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Separator,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { StatsCard, StatusBadge, DialogButtons } from '@/components/blocks';
import {
  TrendingUp,
  Percent,
  Settings,
  Plus,
  Edit2,
  Trash2,
  Zap,
  Target,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Search,
  FileText,
  Sliders,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

const CURRENCY = 'INR';

export default function PricingOptimizerPage() {
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'models' | 'rules' | 'simulator' | 'bulk'>('dashboard');
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<PricingModel | null>(null);
  const [editingRule, setEditingRule] = useState<OptimizationRule | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [simulatorFactors, setSimulatorFactors] = useState({
    demandFactor: 1.0,
    competitionFactor: 1.0,
    seasonalityFactor: 1.0,
    inventoryFactor: 1.0,
  });
  const [bulkUpdates, setBulkUpdates] = useState<BulkPriceUpdate[]>([]);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  // Queries
  const { data: stats } = useQuery({
    queryKey: ['pricing-stats'],
    queryFn: pricingStatsApi.getOverview,
  });

  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['pricing-models'],
    queryFn: pricingModelApi.list,
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ['optimization-rules'],
    queryFn: optimizationRulesApi.list,
  });

  const { data: priceHistory = [] } = useQuery({
    queryKey: ['price-history'],
    queryFn: priceHistoryApi.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-pricing'],
    queryFn: () => productsApi.list(),
  });

  const { data: marginAnalysis } = useQuery({
    queryKey: ['margin-analysis'],
    queryFn: pricingStatsApi.getMarginAnalysis,
  });

  const formatPrice = (amount: number) => formatCurrency(amount, CURRENCY);

  // Mutations
  const createModelMutation = useMutation({
    mutationFn: pricingModelApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-models'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-stats'] });
      setIsModelDialogOpen(false);
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof pricingModelApi.update>[1] }) =>
      pricingModelApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-models'] });
      setEditingModel(null);
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: pricingModelApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-models'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-stats'] });
    },
  });

  const calculatePriceMutation = useMutation({
    mutationFn: ({ modelId, factors }: { modelId: number; factors: typeof simulatorFactors }) =>
      dynamicPricingApi.calculate(modelId, factors),
  });

  const createRuleMutation = useMutation({
    mutationFn: optimizationRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimization-rules'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-stats'] });
      setIsRuleDialogOpen(false);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: optimizationRulesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimization-rules'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-stats'] });
    },
  });

  const bulkOptimizeMutation = useMutation({
    mutationFn: dynamicPricingApi.bulkOptimize,
    onSuccess: (data: BulkPriceUpdate[]) => {
      setBulkUpdates(data);
    },
  });

  const applyBulkUpdateMutation = useMutation({
    mutationFn: dynamicPricingApi.applyBulkUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-models'] });
      setBulkUpdates([]);
      setSelectedForBulk(new Set());
    },
  });

  // Chart data
  const historyChartData = priceHistory.slice(-30).map((h: PriceCalculation) => ({
    date: new Date(h.calculationDate).toLocaleDateString(),
    base: h.basePrice,
    calculated: h.calculatedPrice,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold">Pricing Optimizer</h1>
              <p className="text-sm text-muted-foreground">AI-driven dynamic pricing & optimization</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'dashboard' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('dashboard')}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <Button
              variant={activeTab === 'models' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('models')}
            >
              <Settings className="h-4 w-4 mr-1" />
              Models
            </Button>
            <Button
              variant={activeTab === 'rules' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('rules')}
            >
              <Zap className="h-4 w-4 mr-1" />
              Rules
            </Button>
            <Button
              variant={activeTab === 'simulator' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('simulator')}
            >
              <Calculator className="h-4 w-4 mr-1" />
              Simulator
            </Button>
            <Button
              variant={activeTab === 'bulk' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('bulk')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Bulk Update
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            marginAnalysis={marginAnalysis}
            historyChartData={historyChartData}
            formatPrice={formatPrice}
            models={models}
            rules={rules}
          />
        )}

        {activeTab === 'models' && (
          <ModelsTab
            models={models}
            loadingModels={loadingModels}
            formatPrice={formatPrice}
            onAdd={() => setIsModelDialogOpen(true)}
            onEdit={setEditingModel}
            onDelete={(id) => {
              if (confirm('Delete this pricing model?')) {
                deleteModelMutation.mutate(id);
              }
            }}
          />
        )}

        {activeTab === 'rules' && (
          <RulesTab
            rules={rules}
            loadingRules={loadingRules}
            onAdd={() => setIsRuleDialogOpen(true)}
            onEdit={setEditingRule}
            onDelete={(id) => {
              if (confirm('Delete this rule?')) {
                deleteRuleMutation.mutate(id);
              }
            }}
          />
        )}

        {activeTab === 'simulator' && (
          <SimulatorTab
            models={models}
            selectedModelId={selectedModelId}
            setSelectedModelId={setSelectedModelId}
            factors={simulatorFactors}
            setFactors={setSimulatorFactors}
            onCalculate={() => {
              if (selectedModelId) {
                calculatePriceMutation.mutate({ modelId: selectedModelId, factors: simulatorFactors });
              }
            }}
            calculationResult={calculatePriceMutation.data}
            isCalculating={calculatePriceMutation.isPending}
            formatPrice={formatPrice}
          />
        )}

        {activeTab === 'bulk' && (
          <BulkUpdateTab
            products={products}
            bulkUpdates={bulkUpdates}
            selectedForBulk={selectedForBulk}
            setSelectedForBulk={setSelectedForBulk}
            onOptimize={(productIds) => bulkOptimizeMutation.mutate(productIds)}
            onApply={(updates) => applyBulkUpdateMutation.mutate(updates)}
            isOptimizing={bulkOptimizeMutation.isPending}
            isApplying={applyBulkUpdateMutation.isPending}
            formatPrice={formatPrice}
          />
        )}
      </main>

      {/* Model Dialog */}
      <ModelFormDialog
        open={isModelDialogOpen || !!editingModel}
        onOpenChange={(open) => {
          if (!open) {
            setIsModelDialogOpen(false);
            setEditingModel(null);
          }
        }}
        onSubmit={(data) => {
          if (editingModel) {
            updateModelMutation.mutate({ id: editingModel.id, data });
          } else {
            createModelMutation.mutate(data);
          }
        }}
        isLoading={createModelMutation.isPending || updateModelMutation.isPending}
        products={products}
        initialData={editingModel}
      />

      {/* Rule Dialog */}
      <RuleFormDialog
        open={isRuleDialogOpen || !!editingRule}
        onOpenChange={(open) => {
          if (!open) {
            setIsRuleDialogOpen(false);
            setEditingRule(null);
          }
        }}
        onSubmit={(data) => {
          if (editingRule) {
            // updateRuleMutation.mutate({ id: editingRule.id, data });
          } else {
            createRuleMutation.mutate(data);
          }
        }}
        isLoading={createRuleMutation.isPending}
        initialData={editingRule}
      />
    </div>
  );
}

// ============================================================================
// DASHBOARD TAB
// ============================================================================

function DashboardTab({
  stats,
  marginAnalysis,
  historyChartData,
  formatPrice,
  models,
  rules,
}: {
  stats?: { totalPricingModels: number; activePricingModels: number; totalOptimizationRules: number; activeOptimizationRules: number; totalPriceCalculations: number; averagePriceChange: number };
  marginAnalysis?: { avgMargin: number; marginByCategory: { category: string; margin: number }[]; lowMarginProducts: { productId: string; name: string; margin: number }[] };
  historyChartData: { date: string; base: number; calculated: number }[];
  formatPrice: (n: number) => string;
  models: PricingModel[];
  rules: OptimizationRule[];
}) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Pricing Models"
          value={`${stats?.activePricingModels || 0} / ${stats?.totalPricingModels || 0}`}
          icon={Settings}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          subtitle="Active / Total"
        />
        <StatsCard
          title="Optimization Rules"
          value={`${stats?.activeOptimizationRules || 0}`}
          icon={Zap}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-100"
          subtitle={`${stats?.totalOptimizationRules || 0} total rules`}
        />
        <StatsCard
          title="Avg. Margin"
          value={`${((marginAnalysis?.avgMargin || 0) * 100).toFixed(1)}%`}
          icon={Percent}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
        />
        <StatsCard
          title="Avg. Price Change"
          value={`${((stats?.averagePriceChange || 0) * 100).toFixed(2)}%`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
          subtitle={`${stats?.totalPriceCalculations || 0} calculations`}
        />
      </div>

      {/* Price History Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Price History (Last 30 Calculations)</CardTitle>
        </CardHeader>
        <CardContent>
          {historyChartData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="base" stroke="#94a3b8" fill="#f1f5f9" name="Base Price" />
                  <Area type="monotone" dataKey="calculated" stroke="#10b981" fill="#d1fae5" name="Dynamic Price" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No price history data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Margin Products Alert */}
      {marginAnalysis?.lowMarginProducts && marginAnalysis.lowMarginProducts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Low Margin Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {marginAnalysis.lowMarginProducts.slice(0, 10).map((p) => (
                <Badge key={p.productId} variant="outline" className="bg-white">
                  {p.name}: {(p.margin * 100).toFixed(1)}%
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {models.slice(0, 5).map((model) => (
                <div key={model.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div>
                    <p className="font-medium">{model.modelName}</p>
                    <p className="text-xs text-muted-foreground">Base: {formatPrice(model.basePrice)}</p>
                  </div>
                  <StatusBadge
                    status={model.status === 'active' ? 'active' : 'inactive'}
                    label={model.status}
                    size="sm"
                  />
                </div>
              ))}
              {models.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No models created yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rules.filter(r => r.status === 'active').slice(0, 5).map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rule.conditions.length} conditions, {rule.actions.length} actions
                    </p>
                  </div>
                  <Badge variant="outline">Priority: {rule.priority}</Badge>
                </div>
              ))}
              {rules.filter(r => r.status === 'active').length === 0 && (
                <p className="text-center text-muted-foreground py-4">No active rules</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// MODELS TAB
// ============================================================================

function ModelsTab({
  models,
  loadingModels,
  formatPrice,
  onAdd,
  onEdit,
  onDelete,
}: {
  models: PricingModel[];
  loadingModels: boolean;
  formatPrice: (n: number) => string;
  onAdd: () => void;
  onEdit: (model: PricingModel) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pricing Models</h2>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Create Model
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model Name</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Base Price</TableHead>
                <TableHead>Weights</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingModels ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-12 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Settings className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No pricing models yet</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Create First Model
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">{model.modelName}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">{model.productId}</code>
                      {model.productName && (
                        <p className="text-xs text-muted-foreground">{model.productName}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPrice(model.basePrice)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">D:{model.modelParameters.demandWeight}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>Demand Weight</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">C:{model.modelParameters.competitionWeight}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>Competition Weight</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">S:{model.modelParameters.seasonalityWeight}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>Seasonality Weight</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">I:{model.modelParameters.inventoryWeight}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>Inventory Weight</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={model.status === 'active' ? 'active' : model.status === 'testing' ? 'warning' : 'inactive'}
                        label={model.status}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(model)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => onDelete(model.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ============================================================================
// RULES TAB
// ============================================================================

function RulesTab({
  rules,
  loadingRules,
  onAdd,
  onEdit,
  onDelete,
}: {
  rules: OptimizationRule[];
  loadingRules: boolean;
  onAdd: () => void;
  onEdit: (rule: OptimizationRule) => void;
  onDelete: (id: number) => void;
}) {
  const conditionLabel = (c: RuleCondition) => {
    const ops: Record<string, string> = { gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=', between: 'between' };
    return `${c.field} ${ops[c.operator]} ${Array.isArray(c.value) ? c.value.join('-') : c.value}`;
  };

  const actionLabel = (a: RuleAction) => {
    if (a.type === 'adjust_price') return `Adjust ${a.value}${a.unit === 'percent' ? '%' : ''}`;
    if (a.type === 'set_price') return `Set to ${a.value}`;
    if (a.type === 'apply_discount') return `Discount ${a.value}${a.unit === 'percent' ? '%' : ''}`;
    return a.type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Optimization Rules</h2>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Create Rule
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingRules ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-12 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Zap className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No optimization rules yet</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Create First Rule
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.conditions.map((c, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{conditionLabel(c)}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.actions.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{actionLabel(a)}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={rule.status === 'active' ? 'active' : 'inactive'}
                        label={rule.status}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(rule)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => onDelete(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ============================================================================
// SIMULATOR TAB
// ============================================================================

function SimulatorTab({
  models,
  selectedModelId,
  setSelectedModelId,
  factors,
  setFactors,
  onCalculate,
  calculationResult,
  isCalculating,
  formatPrice,
}: {
  models: PricingModel[];
  selectedModelId: number | null;
  setSelectedModelId: (id: number | null) => void;
  factors: { demandFactor: number; competitionFactor: number; seasonalityFactor: number; inventoryFactor: number };
  setFactors: (f: typeof factors) => void;
  onCalculate: () => void;
  calculationResult?: { price: number; calculation: { basePrice: number; calculatedPrice: number } };
  isCalculating: boolean;
  formatPrice: (n: number) => string;
}) {
  // selectedModel can be used for displaying model details if needed
  const _selectedModel = models.find((m) => m.id === selectedModelId);
  void _selectedModel;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Price Simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Select Pricing Model</Label>
            <Select
              value={selectedModelId?.toString() || ''}
              onValueChange={(v) => setSelectedModelId(v ? parseInt(v) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id.toString()}>
                    {model.modelName} ({formatPrice(model.basePrice)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-4">
            <FactorSlider
              label="Demand Factor"
              value={factors.demandFactor}
              onChange={(v) => setFactors({ ...factors, demandFactor: v })}
              description="Higher = more demand (increases price)"
            />
            <FactorSlider
              label="Competition Factor"
              value={factors.competitionFactor}
              onChange={(v) => setFactors({ ...factors, competitionFactor: v })}
              description="Higher = less competition (can increase price)"
            />
            <FactorSlider
              label="Seasonality Factor"
              value={factors.seasonalityFactor}
              onChange={(v) => setFactors({ ...factors, seasonalityFactor: v })}
              description="Higher = peak season (increases price)"
            />
            <FactorSlider
              label="Inventory Factor"
              value={factors.inventoryFactor}
              onChange={(v) => setFactors({ ...factors, inventoryFactor: v })}
              description="Higher = low stock (increases price)"
            />
          </div>

          <Button
            className="w-full"
            onClick={onCalculate}
            disabled={!selectedModelId || isCalculating}
          >
            {isCalculating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate Dynamic Price
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Result
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calculationResult ? (
            <div className="space-y-6">
              <div className="text-center p-6 bg-emerald-50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Optimized Price</p>
                <p className="text-4xl font-bold text-emerald-700">
                  {formatPrice(calculationResult.price)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Base Price</p>
                  <p className="text-xl font-semibold">{formatPrice(calculationResult.calculation.basePrice)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className={`text-xl font-semibold flex items-center justify-center gap-1 ${
                    calculationResult.price > calculationResult.calculation.basePrice ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {calculationResult.price > calculationResult.calculation.basePrice ? (
                      <ArrowUpRight className="h-5 w-5" />
                    ) : (
                      <ArrowDownRight className="h-5 w-5" />
                    )}
                    {(((calculationResult.price - calculationResult.calculation.basePrice) / calculationResult.calculation.basePrice) * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Factor Impact</p>
                <div className="space-y-1">
                  <FactorBar label="Demand" value={factors.demandFactor} />
                  <FactorBar label="Competition" value={factors.competitionFactor} />
                  <FactorBar label="Seasonality" value={factors.seasonalityFactor} />
                  <FactorBar label="Inventory" value={factors.inventoryFactor} />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
              <Calculator className="h-12 w-12 mb-4 opacity-50" />
              <p>Select a model and adjust factors</p>
              <p className="text-sm">then click Calculate</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FactorSlider({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0.5"
        max="2.0"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const percentage = ((value - 0.5) / 1.5) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value > 1 ? 'bg-green-500' : value < 1 ? 'bg-amber-500' : 'bg-gray-400'}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

// ============================================================================
// BULK UPDATE TAB
// ============================================================================

function BulkUpdateTab({
  products,
  bulkUpdates,
  selectedForBulk,
  setSelectedForBulk,
  onOptimize,
  onApply,
  isOptimizing,
  isApplying,
  formatPrice,
}: {
  products: { id: string; name: string; sku: string; price: number; cost: number }[];
  bulkUpdates: BulkPriceUpdate[];
  selectedForBulk: Set<string>;
  setSelectedForBulk: (s: Set<string>) => void;
  onOptimize: (productIds: string[]) => void;
  onApply: (updates: { productId: string; newPrice: number }[]) => void;
  isOptimizing: boolean;
  isApplying: boolean;
  formatPrice: (n: number) => string;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedForBulk);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedForBulk(newSet);
  };

  const selectAll = () => {
    if (selectedForBulk.size === filteredProducts.length) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bulk Price Optimization</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOptimize(Array.from(selectedForBulk))}
            disabled={selectedForBulk.size === 0 || isOptimizing}
          >
            {isOptimizing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Optimize Selected ({selectedForBulk.size})
              </>
            )}
          </Button>
          {bulkUpdates.length > 0 && (
            <Button
              onClick={() =>
                onApply(bulkUpdates.map((u) => ({ productId: u.productId, newPrice: u.suggestedPrice })))
              }
              disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Apply All Updates
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {bulkUpdates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Optimization Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkUpdates.map((update) => (
                    <TableRow key={update.productId}>
                      <TableCell className="font-medium">{update.productId}</TableCell>
                      <TableCell className="text-right">{formatPrice(update.currentPrice)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatPrice(update.suggestedPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={update.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {update.priceChange >= 0 ? '+' : ''}{update.changePercent.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{update.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="sm" onClick={selectAll}>
                {selectedForBulk.size === filteredProducts.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedForBulk.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={selectAll}
                        className="h-4 w-4 rounded"
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const margin = product.price > 0 ? ((product.price - product.cost) / product.price) * 100 : 0;
                    return (
                      <TableRow key={product.id} className={selectedForBulk.has(product.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedForBulk.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="h-4 w-4 rounded"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-0.5 rounded">{product.sku}</code>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatPrice(product.cost)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(product.price)}</TableCell>
                        <TableCell className="text-right">
                          <span className={margin < 20 ? 'text-amber-600' : 'text-green-600'}>
                            {margin.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// MODEL FORM DIALOG
// ============================================================================

function ModelFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  products,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Parameters<typeof pricingModelApi.create>[0]) => void;
  isLoading: boolean;
  products: { id: string; name: string; sku: string; price: number }[];
  initialData?: PricingModel | null;
}) {
  const [formData, setFormData] = useState({
    productId: initialData?.productId || '',
    basePrice: initialData?.basePrice || 0,
    modelName: initialData?.modelName || '',
    demandWeight: initialData?.modelParameters.demandWeight || 0.25,
    competitionWeight: initialData?.modelParameters.competitionWeight || 0.25,
    seasonalityWeight: initialData?.modelParameters.seasonalityWeight || 0.25,
    inventoryWeight: initialData?.modelParameters.inventoryWeight || 0.25,
  });

  const handleProductSelect = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setFormData({
      ...formData,
      productId,
      basePrice: product?.price || formData.basePrice,
      modelName: formData.modelName || `${product?.name || 'Product'} Pricing`,
    });
  };

  const totalWeight = formData.demandWeight + formData.competitionWeight + formData.seasonalityWeight + formData.inventoryWeight;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Pricing Model' : 'Create Pricing Model'}</DialogTitle>
          <DialogDescription>
            Configure AI-driven dynamic pricing parameters
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={formData.productId} onValueChange={handleProductSelect} disabled={!!initialData}>
              <SelectTrigger>
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Model Name</Label>
              <Input
                value={formData.modelName}
                onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                placeholder="e.g., Summer Pricing"
              />
            </div>
            <div className="space-y-2">
              <Label>Base Price</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.basePrice || ''}
                onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Factor Weights</Label>
              <span className={`text-sm ${Math.abs(totalWeight - 1) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                Total: {totalWeight.toFixed(2)} {Math.abs(totalWeight - 1) < 0.01 ? '✓' : '(should be 1.0)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Demand Weight</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.demandWeight}
                  onChange={(e) => setFormData({ ...formData, demandWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Competition Weight</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.competitionWeight}
                  onChange={(e) => setFormData({ ...formData, competitionWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Seasonality Weight</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.seasonalityWeight}
                  onChange={(e) => setFormData({ ...formData, seasonalityWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Inventory Weight</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.inventoryWeight}
                  onChange={(e) => setFormData({ ...formData, inventoryWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() =>
            onSubmit({
              productId: formData.productId,
              basePrice: formData.basePrice,
              modelName: formData.modelName,
              modelParameters: {
                demandWeight: formData.demandWeight,
                competitionWeight: formData.competitionWeight,
                seasonalityWeight: formData.seasonalityWeight,
                inventoryWeight: formData.inventoryWeight,
              },
            })
          }
          confirmText={isLoading ? 'Saving...' : initialData ? 'Update Model' : 'Create Model'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.productId || !formData.modelName || formData.basePrice <= 0}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// RULE FORM DIALOG
// ============================================================================

function RuleFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; conditions: RuleCondition[]; actions: RuleAction[]; priority?: number }) => void;
  isLoading: boolean;
  initialData?: OptimizationRule | null;
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    priority: initialData?.priority || 0,
    conditions: initialData?.conditions || [{ field: 'demand' as const, operator: 'gt' as const, value: 1.2 }],
    actions: initialData?.actions || [{ type: 'adjust_price' as const, value: 10, unit: 'percent' as const }],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Rule' : 'Create Optimization Rule'}</DialogTitle>
          <DialogDescription>
            Define conditions and actions for automatic price optimization
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., High Demand Rule"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Condition (When)</Label>
            <div className="flex gap-2">
              <Select
                value={formData.conditions[0]?.field || 'demand'}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    conditions: [{ ...formData.conditions[0], field: v as RuleCondition['field'] }],
                  })
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demand">Demand</SelectItem>
                  <SelectItem value="competition">Competition</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="seasonality">Seasonality</SelectItem>
                  <SelectItem value="margin">Margin</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={formData.conditions[0]?.operator || 'gt'}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    conditions: [{ ...formData.conditions[0], operator: v as RuleCondition['operator'] }],
                  })
                }
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="gte">&gt;=</SelectItem>
                  <SelectItem value="lte">&lt;=</SelectItem>
                  <SelectItem value="eq">=</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.1"
                className="w-[100px]"
                value={formData.conditions[0]?.value as number || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conditions: [{ ...formData.conditions[0], value: parseFloat(e.target.value) || 0 }],
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Action (Then)</Label>
            <div className="flex gap-2">
              <Select
                value={formData.actions[0]?.type || 'adjust_price'}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    actions: [{ ...formData.actions[0], type: v as RuleAction['type'] }],
                  })
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjust_price">Adjust Price</SelectItem>
                  <SelectItem value="apply_discount">Apply Discount</SelectItem>
                  <SelectItem value="alert">Send Alert</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="1"
                className="w-[80px]"
                value={formData.actions[0]?.value || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    actions: [{ ...formData.actions[0], value: parseFloat(e.target.value) || 0 }],
                  })
                }
              />
              <Select
                value={formData.actions[0]?.unit || 'percent'}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    actions: [{ ...formData.actions[0], unit: v as 'percent' | 'fixed' }],
                  })
                }
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Saving...' : initialData ? 'Update Rule' : 'Create Rule'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name}
        />
      </DialogContent>
    </Dialog>
  );
}
