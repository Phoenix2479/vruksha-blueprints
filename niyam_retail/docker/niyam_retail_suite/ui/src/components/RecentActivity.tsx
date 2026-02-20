import React from 'react';
import { formatCurrency, formatRelativeTime } from '../../../../shared/utils/formatting.ts';
import { Activity } from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'sale' | 'invoice' | 'payment' | 'alert';
  title: string;
  description?: string;
  amount?: number;
  timestamp: string;
}

export interface RecentActivityProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  activities,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Activity
        </h3>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Activity
        </h3>
        <p className="text-gray-500 text-center py-8">No recent activity</p>
      </div>
    );
  }

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'sale':
        return 'bg-green-100 text-green-800';
      case 'invoice':
        return 'bg-blue-100 text-blue-800';
      case 'payment':
        return 'bg-purple-100 text-purple-800';
      case 'alert':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5" />
        Recent Activity
      </h3>
      <div className="space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
            <div className={`mt-1 px-2 py-1 rounded text-xs font-medium ${getActivityColor(activity.type)}`}>
              {activity.type.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{activity.title}</p>
              {activity.description && (
                <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs text-gray-500">{formatRelativeTime(activity.timestamp)}</p>
                {activity.amount !== undefined && (
                  <p className="text-xs font-medium text-gray-700">
                    {formatCurrency(activity.amount)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
