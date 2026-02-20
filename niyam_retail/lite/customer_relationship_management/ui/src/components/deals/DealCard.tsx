import { useDraggable } from '@dnd-kit/core';
import { Eye, Calendar, User } from 'lucide-react';
import { Card, CardContent, Button, Badge } from '@shared/components/ui';
import { formatCurrency } from '@shared/config/currency';
import type { Deal } from '../../types/crm360';

interface DealCardProps {
  deal: Deal;
  onView: (deal: Deal) => void;
}

const stageColors: Record<string, string> = {
  qualification: 'bg-blue-100 text-blue-800',
  proposal: 'bg-purple-100 text-purple-800',
  negotiation: 'bg-amber-100 text-amber-800',
  closed_won: 'bg-green-100 text-green-800',
  closed_lost: 'bg-red-100 text-red-800',
};

export function DealCard({ deal, onView }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
      {...listeners}
      {...attributes}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm line-clamp-2">{deal.title}</h4>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); onView(deal); }}>
            <Eye className="h-3 w-3" />
          </Button>
        </div>
        <div className="text-lg font-bold text-primary">{formatCurrency(deal.value, 'INR')}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${stageColors[deal.stage]}`}>
            {deal.probability}%
          </Badge>
          {deal.customer && (
            <span className="flex items-center gap-1 truncate">
              <User className="h-3 w-3" />
              {deal.customer.name}
            </span>
          )}
        </div>
        {deal.expectedCloseDate && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Date(deal.expectedCloseDate).toLocaleDateString()}
          </div>
        )}
        {deal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {deal.tags.slice(0, 2).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DealCardSimple({ deal, onView }: DealCardProps) {
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => onView(deal)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium">{deal.title}</h4>
          <Badge className={stageColors[deal.stage]}>{deal.stage.replace('_', ' ')}</Badge>
        </div>
        <div className="text-xl font-bold text-primary">{formatCurrency(deal.value, 'INR')}</div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {deal.customer?.name || 'No contact'}
          </span>
          {deal.expectedCloseDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(deal.expectedCloseDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
