import { Phone, Mail, Calendar, FileText, CheckSquare, ShoppingCart, RotateCcw, MessageSquare, HelpCircle, Check } from 'lucide-react';
import { Card, CardContent, Badge, Button } from '@shared/components/ui';
import type { Activity } from '../../types/crm360';

interface ActivityTimelineProps {
  activities: Activity[];
  onComplete?: (id: string) => void;
  showCustomer?: boolean;
}

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: FileText,
  task: CheckSquare,
  purchase: ShoppingCart,
  return: RotateCcw,
  inquiry: MessageSquare,
  feedback: HelpCircle,
};

const activityColors: Record<string, string> = {
  call: 'bg-blue-100 text-blue-600',
  email: 'bg-purple-100 text-purple-600',
  meeting: 'bg-green-100 text-green-600',
  note: 'bg-gray-100 text-gray-600',
  task: 'bg-amber-100 text-amber-600',
  purchase: 'bg-emerald-100 text-emerald-600',
  return: 'bg-red-100 text-red-600',
  inquiry: 'bg-cyan-100 text-cyan-600',
  feedback: 'bg-pink-100 text-pink-600',
};

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-600',
  urgent: 'bg-red-100 text-red-600',
};

export function ActivityTimeline({ activities, onComplete, showCustomer = false }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No activities found
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4">
        {activities.map((activity, index) => {
          const Icon = activityIcons[activity.type] || FileText;
          const isCompleted = !!activity.completedAt;
          const isOverdue = activity.dueDate && !isCompleted && new Date(activity.dueDate) < new Date();

          return (
            <div key={activity.id} className="relative flex gap-4 pl-2">
              <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${activityColors[activity.type] || 'bg-gray-100'}`}>
                <Icon className="h-4 w-4" />
              </div>

              <Card className={`flex-1 ${isCompleted ? 'opacity-60' : ''} ${isOverdue ? 'border-red-300' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isCompleted ? 'line-through' : ''}`}>
                          {activity.title}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${priorityColors[activity.priority]}`}>
                          {activity.priority}
                        </Badge>
                        {isCompleted && (
                          <Badge variant="outline" className="text-[10px] bg-green-100 text-green-600">
                            Completed
                          </Badge>
                        )}
                        {isOverdue && (
                          <Badge variant="outline" className="text-[10px] bg-red-100 text-red-600">
                            Overdue
                          </Badge>
                        )}
                      </div>

                      {activity.description && (
                        <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(activity.createdAt).toLocaleDateString()}</span>
                        {activity.dueDate && (
                          <span className={isOverdue ? 'text-red-500' : ''}>
                            Due: {new Date(activity.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {showCustomer && activity.customer && (
                          <span>Contact: {activity.customer.name}</span>
                        )}
                        {activity.deal && (
                          <span>Deal: {activity.deal.title}</span>
                        )}
                      </div>
                    </div>

                    {!isCompleted && onComplete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onComplete(activity.id)}
                        title="Mark as complete"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityCard({ activity, onComplete }: { activity: Activity; onComplete?: (id: string) => void }) {
  const Icon = activityIcons[activity.type] || FileText;
  const isCompleted = !!activity.completedAt;

  return (
    <Card className={isCompleted ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${activityColors[activity.type]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className={`font-medium ${isCompleted ? 'line-through' : ''}`}>{activity.title}</span>
              <Badge className={priorityColors[activity.priority]}>{activity.priority}</Badge>
            </div>
            {activity.description && (
              <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>{activity.type}</span>
              <span>•</span>
              <span>{new Date(activity.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          {!isCompleted && onComplete && (
            <Button variant="outline" size="sm" onClick={() => onComplete(activity.id)}>
              <Check className="h-4 w-4 mr-1" /> Done
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
