import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, closestCorners, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Search, Plus, LayoutGrid, Kanban, Filter, Briefcase, DollarSign, Target, TrendingUp } from 'lucide-react';
import { Input, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, Skeleton, Card, CardContent } from '@shared/components/ui';
import { StatsCard } from '@shared/components/blocks';
import { formatCurrency } from '@shared/config/currency';
import { PipelineColumn } from '../components/deals/PipelineColumn';
import { DealCardSimple } from '../components/deals/DealCard';
import { DealDetailDialog } from '../components/deals/DealDetailDialog';
import { dealsApi, customerApi } from '../api/crm360Api';
import type { Deal, DealStage } from '../types/crm360';

type ViewMode = 'pipeline' | 'list';
const STAGES: DealStage[] = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

export default function SalesPipelineTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals', filterStage, searchTerm],
    queryFn: () => dealsApi.list({
      stage: filterStage !== 'all' ? filterStage as DealStage : undefined,
      search: searchTerm || undefined,
    }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-deals'],
    queryFn: () => customerApi.list(),
  });

  const { data: stats } = useQuery({
    queryKey: ['crm-stats'],
    queryFn: customerApi.getStats,
  });

  const updateDealMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) => dealsApi.update(id, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deals'] }),
  });

  // Enrich deals with customer data
  const enrichedDeals = useMemo(() => {
    return deals.map(deal => ({
      ...deal,
      customer: customers.find(c => c.id === deal.customerId),
    }));
  }, [deals, customers]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<DealStage, Deal[]> = {
      qualification: [],
      proposal: [],
      negotiation: [],
      closed_won: [],
      closed_lost: [],
    };
    enrichedDeals.forEach(deal => {
      if (grouped[deal.stage]) {
        grouped[deal.stage].push(deal);
      }
    });
    return grouped;
  }, [enrichedDeals]);

  const activeDeal = activeDragId ? enrichedDeals.find(d => d.id === activeDragId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const newStage = over.id as DealStage;

    if (STAGES.includes(newStage)) {
      const deal = enrichedDeals.find(d => d.id === dealId);
      if (deal && deal.stage !== newStage) {
        updateDealMutation.mutate({ id: dealId, stage: newStage });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard title="Active Deals" value={`${stats?.activeDeals || 0}`} icon={Briefcase} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
        <StatsCard title="Pipeline Value" value={formatCurrency(stats?.totalPipelineValue || 0, 'INR')} icon={DollarSign} iconColor="text-green-600" iconBgColor="bg-green-100" />
        <StatsCard title="Won Deals" value={`${stats?.wonDeals || 0}`} icon={Target} iconColor="text-emerald-600" iconBgColor="bg-emerald-100" />
        <StatsCard title="Conversion Rate" value={`${(stats?.conversionRate || 0).toFixed(1)}%`} icon={TrendingUp} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="qualification">Qualification</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
            <SelectItem value="negotiation">Negotiation</SelectItem>
            <SelectItem value="closed_won">Closed Won</SelectItem>
            <SelectItem value="closed_lost">Closed Lost</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button variant={viewMode === 'pipeline' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('pipeline')}>
            <Kanban className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
        <Button className="ml-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Pipeline / List View */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.slice(0, 4).map(stage => (
            <Skeleton key={stage} className="h-[400px] min-w-[280px]" />
          ))}
        </div>
      ) : viewMode === 'pipeline' ? (
        <DndContext collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4 min-h-[500px]">
              {STAGES.filter(s => filterStage === 'all' || s === filterStage).map(stage => (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  deals={dealsByStage[stage]}
                  onViewDeal={setSelectedDeal}
                />
              ))}
            </div>
          </ScrollArea>
          <DragOverlay>
            {activeDeal && <DealCardSimple deal={activeDeal} onView={() => {}} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrichedDeals.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                No deals found
              </CardContent>
            </Card>
          ) : (
            enrichedDeals.map(deal => (
              <DealCardSimple key={deal.id} deal={deal} onView={() => setSelectedDeal(deal)} />
            ))
          )}
        </div>
      )}

      {selectedDeal && (
        <DealDetailDialog deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      )}
    </div>
  );
}
