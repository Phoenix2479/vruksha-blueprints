import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  campaignsApi,
  promotionsApi,
  segmentsApi,
  templatesApi,
  type Campaign,
  type Promotion,
  type CustomerSegment,
  type EmailTemplate,
  type MarketingStats,
  type CampaignCreateInput,
  type PromotionCreateInput,
} from '../api/marketingApi';
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
  Progress,
} from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '@/components/blocks';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Play,
  Pause,
  Mail,
  MessageSquare,
  Users,
  Tag,
  TrendingUp,
  Target,
  Gift,
  Calendar,
  BarChart3,
  Copy,
  Eye,
  Send,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

const CURRENCY = 'INR';

export default function MarketingHubPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  // Queries
  const { data: stats } = useQuery<MarketingStats>({
    queryKey: ['marketing-stats'],
    queryFn: campaignsApi.getStats,
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
  });

  const { data: promotions = [], isLoading: loadingPromotions } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => promotionsApi.list(),
  });

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: segmentsApi.list,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  const formatPrice = (amount: number) => formatCurrency(amount, CURRENCY);

  // Mutations
  const createCampaignMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-stats'] });
      setIsCampaignDialogOpen(false);
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: campaignsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-stats'] });
    },
  });

  const launchCampaignMutation = useMutation({
    mutationFn: campaignsApi.launch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: campaignsApi.pause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const createPromotionMutation = useMutation({
    mutationFn: promotionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-stats'] });
      setIsPromotionDialogOpen(false);
    },
  });

  const deletePromotionMutation = useMutation({
    mutationFn: promotionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-stats'] });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Megaphone className="h-7 w-7 text-pink-600" />
            <div>
              <h1 className="text-xl font-bold">Marketing Hub</h1>
              <p className="text-sm text-muted-foreground">Campaigns, promotions & customer engagement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsPromotionDialogOpen(true)}>
              <Tag className="h-4 w-4 mr-1" />
              New Promotion
            </Button>
            <Button onClick={() => setIsCampaignDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="promotions">Promotions</TabsTrigger>
            <TabsTrigger value="segments">Segments</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardView
              stats={stats}
              campaigns={campaigns}
              promotions={promotions}
              formatPrice={formatPrice}
            />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-6">
            <CampaignsView
              campaigns={campaigns}
              loading={loadingCampaigns}
              onAdd={() => setIsCampaignDialogOpen(true)}
              onEdit={setEditingCampaign}
              onDelete={(id: number) => {
                if (confirm('Delete this campaign?')) deleteCampaignMutation.mutate(id);
              }}
              onLaunch={(id: number) => launchCampaignMutation.mutate(id)}
              onPause={(id: number) => pauseCampaignMutation.mutate(id)}
              formatPrice={formatPrice}
            />
          </TabsContent>

          <TabsContent value="promotions" className="mt-6">
            <PromotionsView
              promotions={promotions}
              loading={loadingPromotions}
              onAdd={() => setIsPromotionDialogOpen(true)}
              onEdit={setEditingPromotion}
              onDelete={(id: number) => {
                if (confirm('Delete this promotion?')) deletePromotionMutation.mutate(id);
              }}
              formatPrice={formatPrice}
            />
          </TabsContent>

          <TabsContent value="segments" className="mt-6">
            <SegmentsView segments={segments} />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <TemplatesView templates={templates} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Campaign Dialog */}
      <CampaignFormDialog
        open={isCampaignDialogOpen || !!editingCampaign}
        onOpenChange={(open) => {
          if (!open) {
            setIsCampaignDialogOpen(false);
            setEditingCampaign(null);
          }
        }}
        onSubmit={(data: CampaignCreateInput) => createCampaignMutation.mutate(data)}
        isLoading={createCampaignMutation.isPending}
        segments={segments as CustomerSegment[]}
        templates={templates}
        initialData={editingCampaign}
      />

      {/* Promotion Dialog */}
      <PromotionFormDialog
        open={isPromotionDialogOpen || !!editingPromotion}
        onOpenChange={(open) => {
          if (!open) {
            setIsPromotionDialogOpen(false);
            setEditingPromotion(null);
          }
        }}
        onSubmit={(data: PromotionCreateInput) => createPromotionMutation.mutate(data)}
        isLoading={createPromotionMutation.isPending}
        initialData={editingPromotion}
      />
    </div>
  );
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

function DashboardView({
  stats,
  campaigns,
  promotions,
  formatPrice,
}: {
  stats?: MarketingStats;
  campaigns: Campaign[];
  promotions: Promotion[];
  formatPrice: (n: number) => string;
}) {
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const activePromotions = promotions.filter(p => p.status === 'active');

  const performanceData = activeCampaigns.slice(0, 5).map(c => ({
    name: c.name.substring(0, 15),
    openRate: c.metrics.openRate * 100,
    clickRate: c.metrics.clickRate * 100,
    conversionRate: c.metrics.conversionRate * 100,
  }));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Active Campaigns"
          value={`${stats?.activeCampaigns || 0}`}
          icon={Megaphone}
          iconColor="text-pink-600"
          iconBgColor="bg-pink-100"
          subtitle={`${stats?.scheduledCampaigns || 0} scheduled`}
        />
        <StatsCard
          title="Total Reach"
          value={`${((stats?.totalReach || 0) / 1000).toFixed(1)}K`}
          icon={Users}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
        />
        <StatsCard
          title="Conversions"
          value={`${stats?.totalConversions || 0}`}
          icon={Target}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
          subtitle={`${((stats?.avgConversionRate || 0) * 100).toFixed(1)}% avg rate`}
        />
        <StatsCard
          title="Revenue Generated"
          value={formatPrice(stats?.totalRevenue || 0)}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
        />
      </div>

      {/* Performance Chart */}
      {performanceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <RechartsTooltip />
                  <Bar dataKey="openRate" fill="#3b82f6" name="Open Rate %" />
                  <Bar dataKey="clickRate" fill="#10b981" name="Click Rate %" />
                  <Bar dataKey="conversionRate" fill="#8b5cf6" name="Conversion %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCampaigns.length > 0 ? (
              <div className="space-y-3">
                {activeCampaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.metrics.sent} sent • {(c.metrics.openRate * 100).toFixed(1)}% opened
                      </p>
                    </div>
                    <CampaignTypeBadge type={c.type} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No active campaigns</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Active Promotions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activePromotions.length > 0 ? (
              <div className="space-y-3">
                {activePromotions.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Code: <code className="bg-muted px-1 rounded">{p.code}</code> • {p.usedCount} used
                      </p>
                    </div>
                    <Badge variant="outline">
                      {p.type === 'percentage' ? `${p.value}%` : formatPrice(p.value)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No active promotions</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// CAMPAIGNS VIEW
// ============================================================================

function CampaignsView({
  campaigns,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onLaunch,
  onPause,
  formatPrice,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (c: Campaign) => void;
  onDelete: (id: number) => void;
  onLaunch: (id: number) => void;
  onPause: (id: number) => void;
  formatPrice: (n: number) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Create Campaign
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No campaigns yet</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Create First Campaign
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.content.subject}</p>
                      </div>
                    </TableCell>
                    <TableCell><CampaignTypeBadge type={c.type} /></TableCell>
                    <TableCell>{c.targetAudience.estimatedReach.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{c.metrics.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={c.metrics.openRate > 0.2 ? 'text-green-600' : ''}>
                        {(c.metrics.openRate * 100).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPrice(c.metrics.revenue)}</TableCell>
                    <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.status === 'draft' || c.status === 'paused' ? (
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onLaunch(c.id)}>
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : c.status === 'active' ? (
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPause(c.id)}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => onDelete(c.id)}
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
// PROMOTIONS VIEW
// ============================================================================

function PromotionsView({
  promotions,
  loading,
  onAdd,
  onEdit,
  onDelete,
  formatPrice,
}: {
  promotions: Promotion[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (p: Promotion) => void;
  onDelete: (id: number) => void;
  formatPrice: (n: number) => string;
}) {
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Promotions & Discounts</h2>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Create Promotion
        </Button>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promotion</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Valid Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : promotions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <Gift className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No promotions yet</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
                      Create First Promotion
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                promotions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="bg-muted px-2 py-1 rounded text-sm">{p.code}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(p.code)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{p.type.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">
                      {p.type === 'percentage' ? `${p.value}%` : formatPrice(p.value)}
                    </TableCell>
                    <TableCell>
                      {p.usageLimit ? (
                        <div className="space-y-1">
                          <div className="text-sm">{p.usedCount} / {p.usageLimit}</div>
                          <Progress value={(p.usedCount / p.usageLimit) * 100} className="h-1" />
                        </div>
                      ) : (
                        <span>{p.usedCount} used</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(p.validFrom).toLocaleDateString()} - {new Date(p.validTo).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={p.status === 'active' ? 'active' : p.status === 'expired' ? 'inactive' : 'warning'}
                        label={p.status}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(p)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => onDelete(p.id)}
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
// SEGMENTS VIEW
// ============================================================================

function SegmentsView({ segments }: { segments: CustomerSegment[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Customer Segments</h2>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Create Segment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {segments.map((s) => (
          <Card key={s.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{s.name}</h3>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </div>
                <Badge variant={s.isAutomatic ? 'default' : 'outline'}>
                  {s.isAutomatic ? 'Auto' : 'Manual'}
                </Badge>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg font-semibold">{s.customerCount.toLocaleString()}</span>
                </div>
                <div className="flex gap-1">
                  {s.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {segments.length === 0 && (
          <Card className="col-span-3">
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No segments created yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TEMPLATES VIEW
// ============================================================================

function TemplatesView({ templates }: { templates: EmailTemplate[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Email Templates</h2>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Create Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{t.name}</h3>
                  <Badge variant="outline" className="mt-1">{t.category.replace('_', ' ')}</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.subject}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t.variables.length} variables</span>
                <StatusBadge
                  status={t.isActive ? 'active' : 'inactive'}
                  label={t.isActive ? 'Active' : 'Inactive'}
                  size="sm"
                />
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <Card className="col-span-3">
            <CardContent className="py-8 text-center text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No templates created yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function CampaignTypeBadge({ type }: { type: Campaign['type'] }) {
  const icons: Record<Campaign['type'], React.ReactNode> = {
    email: <Mail className="h-3 w-3" />,
    sms: <MessageSquare className="h-3 w-3" />,
    push: <Send className="h-3 w-3" />,
    social: <Users className="h-3 w-3" />,
    'in-store': <BarChart3 className="h-3 w-3" />,
    'multi-channel': <Megaphone className="h-3 w-3" />,
  };

  return (
    <Badge variant="outline" className="flex items-center gap-1">
      {icons[type]}
      {type}
    </Badge>
  );
}

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const statusMap: Record<Campaign['status'], { status: 'active' | 'inactive' | 'warning' }> = {
    active: { status: 'active' },
    completed: { status: 'active' },
    draft: { status: 'inactive' },
    scheduled: { status: 'warning' },
    paused: { status: 'warning' },
    cancelled: { status: 'inactive' },
  };

  return <StatusBadge {...statusMap[status]} label={status} size="sm" />;
}

// ============================================================================
// CAMPAIGN FORM DIALOG
// ============================================================================

function CampaignFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  segments,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CampaignCreateInput) => void;
  isLoading: boolean;
  segments: CustomerSegment[];
  templates?: EmailTemplate[];
  initialData?: Campaign | null;
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    type: initialData?.type || 'email' as Campaign['type'],
    subject: initialData?.content.subject || '',
    body: initialData?.content.body || '',
    segments: initialData?.targetAudience.segments || [] as string[],
    startDate: initialData?.schedule.startDate || new Date().toISOString().split('T')[0],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
          <DialogDescription>Set up your marketing campaign</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Summer Sale Campaign"
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as Campaign['type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="push">Push Notification</SelectItem>
                  <SelectItem value="social">Social Media</SelectItem>
                  <SelectItem value="in-store">In-Store</SelectItem>
                  <SelectItem value="multi-channel">Multi-Channel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subject Line *</Label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Don't miss our biggest sale!"
            />
          </div>

          <div className="space-y-2">
            <Label>Message Body *</Label>
            <textarea
              className="w-full min-h-[100px] p-3 border rounded-md resize-none"
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Write your campaign message..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Segment</Label>
              <Select
                value={formData.segments[0] || ''}
                onValueChange={(v) => setFormData({ ...formData, segments: v ? [v] : [] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Customers</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit({
            name: formData.name,
            type: formData.type,
            targetAudience: {
              segments: formData.segments,
              filters: {},
              estimatedReach: 0,
            },
            content: {
              subject: formData.subject,
              body: formData.body,
            },
            schedule: {
              startDate: formData.startDate,
              timezone: 'UTC',
            },
          })}
          confirmText={isLoading ? 'Creating...' : initialData ? 'Update' : 'Create Campaign'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name || !formData.subject || !formData.body}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// PROMOTION FORM DIALOG
// ============================================================================

function PromotionFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PromotionCreateInput) => void;
  isLoading: boolean;
  initialData?: Promotion | null;
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    code: initialData?.code || '',
    type: initialData?.type || 'percentage' as Promotion['type'],
    value: initialData?.value || 10,
    minPurchase: initialData?.minPurchase,
    usageLimit: initialData?.usageLimit,
    validFrom: initialData?.validFrom?.split('T')[0] || new Date().toISOString().split('T')[0],
    validTo: initialData?.validTo?.split('T')[0] || '',
  });

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setFormData({ ...formData, code });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Promotion' : 'Create Promotion'}</DialogTitle>
          <DialogDescription>Set up a discount or promotion code</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Promotion Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Summer Sale 20% Off"
            />
          </div>

          <div className="space-y-2">
            <Label>Promo Code *</Label>
            <div className="flex gap-2">
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER20"
              />
              <Button type="button" variant="outline" onClick={generateCode}>
                Generate
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as Promotion['type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Off</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                  <SelectItem value="bogo">Buy One Get One</SelectItem>
                  <SelectItem value="shipping">Free Shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value *</Label>
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Purchase</Label>
              <Input
                type="number"
                value={formData.minPurchase || ''}
                onChange={(e) => setFormData({ ...formData, minPurchase: parseFloat(e.target.value) || undefined })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Usage Limit</Label>
              <Input
                type="number"
                value={formData.usageLimit || ''}
                onChange={(e) => setFormData({ ...formData, usageLimit: parseInt(e.target.value) || undefined })}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valid From *</Label>
              <Input
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Valid To *</Label>
              <Input
                type="date"
                value={formData.validTo}
                onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit({
            name: formData.name,
            code: formData.code,
            type: formData.type,
            value: formData.value,
            minPurchase: formData.minPurchase,
            usageLimit: formData.usageLimit,
            validFrom: formData.validFrom,
            validTo: formData.validTo,
          })}
          confirmText={isLoading ? 'Creating...' : initialData ? 'Update' : 'Create Promotion'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name || !formData.code || !formData.validTo}
        />
      </DialogContent>
    </Dialog>
  );
}
