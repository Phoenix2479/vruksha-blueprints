import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  customerApi,
  pointsApi,
  rewardsApi,
  statsApi,
  type LoyaltyMember,
  type CreateMemberRequest,
} from '../api/loyaltyApi';
import { formatCurrency } from '../../../../shared/config/currency';
import type { LoyaltyReward } from '../../../../shared/types/retail';
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
} from '../../../../shared/components/ui';
import { 
  Sidebar,
  PageHeader,
  StatsCard, 
  StatusBadge, 
  DialogButtons,
  ThemeToggle,
  type SidebarGroup,
} from '../../../../shared/components/blocks';
import {
  Gift,
  Users,
  Star,
  Search,
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  Award,
  History,
  PlusCircle,
  MinusCircle,
  Phone,
  Mail,
  BarChart3,
  Settings,
  Percent,
  Crown,
} from 'lucide-react';

const CURRENCY = 'INR';

const tierConfig: Record<string, { color: string; icon: string; bgColor: string }> = {
  bronze: { color: 'text-amber-700', icon: '🥉', bgColor: 'bg-amber-100' },
  silver: { color: 'text-gray-500', icon: '🥈', bgColor: 'bg-gray-100' },
  gold: { color: 'text-yellow-600', icon: '🥇', bgColor: 'bg-yellow-100' },
  platinum: { color: 'text-slate-700', icon: '💎', bgColor: 'bg-slate-100' },
  diamond: { color: 'text-cyan-500', icon: '👑', bgColor: 'bg-cyan-100' },
};

// Tab types
type TabId = 'members' | 'rewards' | 'tiers' | 'analytics' | 'settings';

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Loyalty',
    items: [
      { id: 'members', label: 'Members', icon: Users },
      { id: 'rewards', label: 'Rewards', icon: Award },
      { id: 'tiers', label: 'Tier Levels', icon: Crown },
    ],
  },
  {
    label: 'Reports',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function LoyaltyMainPage() {
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<TabId>('members');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<LoyaltyMember | null>(null);
  const [selectedMember, setSelectedMember] = useState<LoyaltyMember | null>(null);
  const [isPointsDialogOpen, setIsPointsDialogOpen] = useState(false);
  const [isRewardsDialogOpen, setIsRewardsDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);

  // Queries
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['loyalty-members', searchQuery, tierFilter, page],
    queryFn: () => customerApi.list({
      search: searchQuery || undefined,
      tier: tierFilter !== 'all' ? tierFilter : undefined,
      page,
      limit: 25,
    }),
  });

  const { data: stats } = useQuery({
    queryKey: ['loyalty-stats'],
    queryFn: statsApi.getOverview,
  });

  const { data: rewards = [] } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: rewardsApi.list,
  });

  const members = membersData?.customers || [];
  const totalMembers = membersData?.total || 0;

  const formatPrice = (amount: number) => formatCurrency(amount, CURRENCY);

  // Mutations
  const createMemberMutation = useMutation({
    mutationFn: customerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-members'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-stats'] });
      setIsAddMemberOpen(false);
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateMemberRequest> }) =>
      customerApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-members'] });
      setEditingMember(null);
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: customerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-members'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-stats'] });
    },
  });

  const adjustPointsMutation = useMutation({
    mutationFn: pointsApi.adjust,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-members'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-stats'] });
      setIsPointsDialogOpen(false);
      setSelectedMember(null);
    },
  });

  // Tier colors for status badge
  const getTierStatus = (tier: string): 'active' | 'warning' | 'info' | 'success' => {
    switch (tier) {
      case 'platinum':
      case 'diamond':
        return 'success';
      case 'gold':
        return 'active';
      case 'silver':
        return 'info';
      default:
        return 'warning';
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <Sidebar
        groups={sidebarGroups}
        activeItem={activeTab}
        onItemClick={(id) => setActiveTab(id as TabId)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        header={{
          icon: Gift,
          title: 'Customer Loyalty',
          subtitle: 'Loyalty Program',
        }}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <PageHeader
          title="Customer Loyalty"
          description="Manage loyalty program and rewards"
          actions={<ThemeToggle />}
        >
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsRewardsDialogOpen(true)}>
              <Award className="h-4 w-4 mr-1" />
              Rewards
            </Button>
            <Button onClick={() => setIsAddMemberOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Member
            </Button>
          </div>
        </PageHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Total Members"
            value={stats?.totalMembers || totalMembers}
            icon={Users}
            iconColor="text-pink-600"
            iconBgColor="bg-pink-100"
          />
          <StatsCard
            title="Points in Circulation"
            value={((stats?.totalPointsIssued || 0) - (stats?.totalPointsRedeemed || 0)).toLocaleString()}
            icon={Star}
            iconColor="text-yellow-600"
            iconBgColor="bg-yellow-100"
          />
          <StatsCard
            title="Avg Points/Member"
            value={Math.round(stats?.avgPointsPerMember || 0).toLocaleString()}
            icon={TrendingUp}
            iconColor="text-green-600"
            iconBgColor="bg-green-100"
          />
          <StatsCard
            title="Redemption Rate"
            value={`${((stats?.redemptionRate || 0) * 100).toFixed(1)}%`}
            icon={Award}
            iconColor="text-purple-600"
            iconBgColor="bg-purple-100"
          />
        </div>

        {/* Tier Distribution */}
        {stats?.membersByTier && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tier Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {Object.entries(stats.membersByTier).map(([tier, count]) => (
                  <div
                    key={tier}
                    className={`flex-1 p-3 rounded-lg ${tierConfig[tier]?.bgColor || 'bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{tierConfig[tier]?.icon || '🏷️'}</span>
                      <div>
                        <p className="font-medium capitalize">{tier}</p>
                        <p className="text-2xl font-bold">{count}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="diamond">Diamond</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-sm text-muted-foreground ml-auto">
                {totalMembers} member{totalMembers !== 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Members Table */}
        <Card>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Lifetime Spent</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-14 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No members found</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => setIsAddMemberOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Member
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      formatPrice={formatPrice}
                      getTierStatus={getTierStatus}
                      onEdit={() => setEditingMember(member)}
                      onDelete={() => {
                        if (confirm('Delete this member?')) {
                          deleteMemberMutation.mutate(member.id);
                        }
                      }}
                      onAdjustPoints={() => {
                        setSelectedMember(member);
                        setIsPointsDialogOpen(true);
                      }}
                      onViewHistory={() => {
                        setSelectedMember(member);
                        setIsHistoryDialogOpen(true);
                      }}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Pagination */}
        {membersData && membersData.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {membersData.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= membersData.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
          </div>
        </ScrollArea>
      </main>

      {/* Add Member Dialog */}
      <MemberFormDialog
        open={isAddMemberOpen}
        onOpenChange={setIsAddMemberOpen}
        onSubmit={(data) => createMemberMutation.mutate(data)}
        isLoading={createMemberMutation.isPending}
        title="Add Member"
      />

      {/* Edit Member Dialog */}
      {editingMember && (
        <MemberFormDialog
          open={!!editingMember}
          onOpenChange={(open) => !open && setEditingMember(null)}
          onSubmit={(data) => updateMemberMutation.mutate({ id: editingMember.id, data })}
          isLoading={updateMemberMutation.isPending}
          title="Edit Member"
          initialData={editingMember}
        />
      )}

      {/* Points Adjustment Dialog */}
      {selectedMember && (
        <PointsAdjustmentDialog
          open={isPointsDialogOpen}
          onOpenChange={(open) => {
            setIsPointsDialogOpen(open);
            if (!open) setSelectedMember(null);
          }}
          member={selectedMember}
          onSubmit={(points, type, reason) => {
            adjustPointsMutation.mutate({
              memberId: selectedMember.id,
              points,
              type,
              reason,
            });
          }}
          isLoading={adjustPointsMutation.isPending}
        />
      )}

      {/* History Dialog */}
      {selectedMember && (
        <PointsHistoryDialog
          open={isHistoryDialogOpen}
          onOpenChange={(open) => {
            setIsHistoryDialogOpen(open);
            if (!open) setSelectedMember(null);
          }}
          member={selectedMember}
        />
      )}

      {/* Rewards Management Dialog */}
      <RewardsManagementDialog
        open={isRewardsDialogOpen}
        onOpenChange={setIsRewardsDialogOpen}
        rewards={rewards}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['loyalty-rewards'] })}
      />
    </div>
  );
}

// ============================================================================
// MEMBER ROW
// ============================================================================

function MemberRow({
  member,
  formatPrice,
  getTierStatus,
  onEdit,
  onDelete,
  onAdjustPoints,
  onViewHistory,
}: {
  member: LoyaltyMember;
  formatPrice: (n: number) => string;
  getTierStatus: (tier: string) => 'active' | 'warning' | 'info' | 'success';
  onEdit: () => void;
  onDelete: () => void;
  onAdjustPoints: () => void;
  onViewHistory: () => void;
}) {
  const tier = tierConfig[member.loyaltyTier] || tierConfig.bronze;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full ${tier.bgColor} flex items-center justify-center`}>
            <span className="text-lg">{tier.icon}</span>
          </div>
          <div>
            <p className="font-medium">
              {member.firstName} {member.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              Since {new Date(member.memberSince).toLocaleDateString()}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {member.email && (
            <p className="text-sm flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {member.email}
            </p>
          )}
          {member.phone && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {member.phone}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <p className="font-semibold text-lg">{member.loyaltyPoints.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">
          Lifetime: {member.lifetimePoints.toLocaleString()}
        </p>
      </TableCell>
      <TableCell>
        <StatusBadge
          status={getTierStatus(member.loyaltyTier)}
          label={member.loyaltyTier.charAt(0).toUpperCase() + member.loyaltyTier.slice(1)}
          size="sm"
        />
      </TableCell>
      <TableCell className="text-right">
        {formatPrice(member.totalSpent)}
      </TableCell>
      <TableCell className="text-right">
        {member.visitCount}
      </TableCell>
      <TableCell>
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onAdjustPoints}>
                  <Star className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Adjust Points</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onViewHistory}>
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>History</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onEdit}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// MEMBER FORM DIALOG
// ============================================================================

function MemberFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  title,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateMemberRequest) => void;
  isLoading: boolean;
  title: string;
  initialData?: LoyaltyMember;
}) {
  const [formData, setFormData] = useState<CreateMemberRequest>(() => {
    if (initialData) {
      return {
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        email: initialData.email || '',
        phone: initialData.phone,
        dateOfBirth: initialData.dateOfBirth,
        address: initialData.address,
      };
    }
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      address: undefined,
    };
  });

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      address: undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {initialData ? 'Update member details' : 'Add a new loyalty member'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Smith"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={formData.dateOfBirth || ''}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={formData.address?.line1 || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                address: { ...formData.address, line1: e.target.value } 
              })}
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={formData.address?.city || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { ...formData.address, city: e.target.value } 
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input
                value={formData.address?.state || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { ...formData.address, state: e.target.value } 
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input
                value={formData.address?.postalCode || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { ...formData.address, postalCode: e.target.value } 
                })}
              />
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Saving...' : initialData ? 'Save Changes' : 'Add Member'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.firstName.trim() || !formData.lastName.trim() || !formData.phone.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// POINTS ADJUSTMENT DIALOG
// ============================================================================

function PointsAdjustmentDialog({
  open,
  onOpenChange,
  member,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: LoyaltyMember;
  onSubmit: (points: number, type: 'earn' | 'redeem' | 'adjust', reason: string) => void;
  isLoading: boolean;
}) {
  const [points, setPoints] = useState(0);
  const [type, setType] = useState<'earn' | 'redeem' | 'adjust'>('earn');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onSubmit(type === 'redeem' ? -Math.abs(points) : points, type, reason);
    setPoints(0);
    setType('earn');
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Adjust Points
          </DialogTitle>
          <DialogDescription>
            Current balance: {member.loyaltyPoints.toLocaleString()} points
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button
              variant={type === 'earn' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setType('earn')}
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Add
            </Button>
            <Button
              variant={type === 'redeem' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setType('redeem')}
            >
              <MinusCircle className="h-4 w-4 mr-1" />
              Deduct
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Points</Label>
            <Input
              type="number"
              min={0}
              value={points || ''}
              onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
              placeholder="Enter points"
            />
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Manual adjustment, Bonus, Correction"
            />
          </div>

          {points > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                New balance: <span className="font-semibold">
                  {(member.loyaltyPoints + (type === 'redeem' ? -points : points)).toLocaleString()}
                </span> points
              </p>
            </div>
          )}
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={handleSubmit}
          confirmText={isLoading ? 'Processing...' : type === 'earn' ? 'Add Points' : 'Deduct Points'}
          confirmLoading={isLoading}
          confirmDisabled={points <= 0 || !reason.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// POINTS HISTORY DIALOG
// ============================================================================

function PointsHistoryDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: LoyaltyMember;
}) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['points-history', member.id],
    queryFn: () => pointsApi.getHistory(member.id),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Points History
          </DialogTitle>
          <DialogDescription>
            {member.firstName} {member.lastName} - {member.loyaltyPoints.toLocaleString()} pts
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[350px] py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium capitalize">{tx.type}</p>
                    <p className="text-sm text-muted-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.points >= 0 ? '+' : ''}{tx.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Balance: {tx.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// REWARDS MANAGEMENT DIALOG
// ============================================================================

function RewardsManagementDialog({
  open,
  onOpenChange,
  rewards,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rewards: LoyaltyReward[];
  onRefresh: () => void;
}) {
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardPoints, setNewRewardPoints] = useState(0);

  const createMutation = useMutation({
    mutationFn: rewardsApi.create,
    onSuccess: () => {
      onRefresh();
      setNewRewardName('');
      setNewRewardPoints(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: rewardsApi.delete,
    onSuccess: () => onRefresh(),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Manage Rewards
          </DialogTitle>
          <DialogDescription>Create and manage loyalty rewards</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add Reward */}
          <div className="flex gap-2">
            <Input
              value={newRewardName}
              onChange={(e) => setNewRewardName(e.target.value)}
              placeholder="Reward name..."
              className="flex-1"
            />
            <Input
              type="number"
              value={newRewardPoints || ''}
              onChange={(e) => setNewRewardPoints(parseInt(e.target.value) || 0)}
              placeholder="Points"
              className="w-24"
            />
            <Button
              onClick={() => createMutation.mutate({
                name: newRewardName,
                pointsCost: newRewardPoints,
                type: 'discount',
              })}
              disabled={!newRewardName.trim() || newRewardPoints <= 0 || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <Separator />

          {/* Rewards List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{reward.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {reward.pointsCost.toLocaleString()} points
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={reward.isActive ? 'active' : 'inactive'}
                      label={reward.isActive ? 'Active' : 'Inactive'}
                      size="sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm(`Delete reward "${reward.name}"?`)) {
                          deleteMutation.mutate(reward.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
