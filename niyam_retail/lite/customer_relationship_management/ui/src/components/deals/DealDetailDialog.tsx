import { useQuery } from '@tanstack/react-query';
import { Briefcase, User, Calendar, DollarSign, Target, Tag, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Separator, Skeleton } from '@shared/components/ui';
import { DialogButtons } from '@shared/components/blocks';
import { formatCurrency } from '@shared/config/currency';
import { activitiesApi } from '../../api/crm360Api';
import type { Deal } from '../../types/crm360';

interface DealDetailDialogProps {
  deal: Deal;
  onClose: () => void;
}

const stageColors: Record<string, string> = {
  qualification: 'bg-blue-100 text-blue-800',
  proposal: 'bg-purple-100 text-purple-800',
  negotiation: 'bg-amber-100 text-amber-800',
  closed_won: 'bg-green-100 text-green-800',
  closed_lost: 'bg-red-100 text-red-800',
};

export function DealDetailDialog({ deal, onClose }: DealDetailDialogProps) {
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['deal-activities', deal.id],
    queryFn: () => activitiesApi.list({ dealId: deal.id }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {deal.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Stage</span>
            <Badge className={stageColors[deal.stage]}>{deal.stage.replace('_', ' ')}</Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Value
            </span>
            <span className="text-xl font-bold">{formatCurrency(deal.value, 'INR')}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Probability
            </span>
            <span className="font-semibold">{deal.probability}%</span>
          </div>

          {deal.customer && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" /> Contact
              </span>
              <span>{deal.customer.name}</span>
            </div>
          )}

          {deal.expectedCloseDate && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Expected Close
              </span>
              <span>{new Date(deal.expectedCloseDate).toLocaleDateString()}</span>
            </div>
          )}

          {deal.tags.length > 0 && (
            <div className="space-y-2">
              <span className="text-muted-foreground flex items-center gap-2">
                <Tag className="h-4 w-4" /> Tags
              </span>
              <div className="flex flex-wrap gap-1">
                {deal.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {deal.notes && (
            <div className="space-y-2">
              <span className="text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Notes
              </span>
              <p className="text-sm bg-muted p-3 rounded-lg">{deal.notes}</p>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="font-medium">Related Activities</p>
            {activitiesLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities for this deal</p>
            ) : (
              <div className="space-y-2 max-h-[150px] overflow-y-auto">
                {activities.slice(0, 5).map(activity => (
                  <div key={activity.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                    <div>
                      <span className="font-medium">{activity.title}</span>
                      <span className="text-muted-foreground ml-2">({activity.type})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogButtons onCancel={onClose} cancelText="Close" />
      </DialogContent>
    </Dialog>
  );
}
