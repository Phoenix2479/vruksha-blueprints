import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle, ScrollArea } from '@shared/components/ui';
import { formatCurrency } from '@shared/config/currency';
import { DealCard } from './DealCard';
import type { Deal, DealStage } from '../../types/crm360';

interface PipelineColumnProps {
  stage: DealStage;
  deals: Deal[];
  onViewDeal: (deal: Deal) => void;
}

const stageInfo: Record<DealStage, { label: string; color: string }> = {
  qualification: { label: 'Qualification', color: 'bg-blue-500' },
  proposal: { label: 'Proposal', color: 'bg-purple-500' },
  negotiation: { label: 'Negotiation', color: 'bg-amber-500' },
  closed_won: { label: 'Closed Won', color: 'bg-green-500' },
  closed_lost: { label: 'Closed Lost', color: 'bg-red-500' },
};

export function PipelineColumn({ stage, deals, onViewDeal }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const info = stageInfo[stage];
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card
      ref={setNodeRef}
      className={`min-w-[280px] max-w-[280px] flex flex-col transition-colors ${isOver ? 'ring-2 ring-primary bg-accent/50' : ''}`}
    >
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${info.color}`} />
          <CardTitle className="text-sm font-medium">{info.label}</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {deals.length}
          </span>
        </div>
        <div className="text-sm font-semibold text-muted-foreground">
          {formatCurrency(totalValue, 'INR')}
        </div>
      </CardHeader>
      <CardContent className="p-2 flex-1 overflow-hidden">
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-2">
            {deals.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No deals
              </div>
            ) : (
              deals.map(deal => (
                <DealCard key={deal.id} deal={deal} onView={onViewDeal} />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
