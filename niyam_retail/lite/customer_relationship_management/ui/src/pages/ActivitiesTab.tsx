import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Search, Plus, Filter, Calendar, Clock, CheckCircle } from 'lucide-react';
import { Input, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Card, CardContent, CardHeader, CardTitle, Skeleton, Badge } from '@shared/components/ui';
import { ActivityTimeline, ActivityCard } from '../components/activities/ActivityTimeline';
import { activitiesApi } from '../api/crm360Api';
import type { ActivityType } from '../types/crm360';

type ViewMode = 'timeline' | 'cards';
type FilterType = 'all' | 'pending' | 'completed' | 'overdue';

export default function ActivitiesTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<FilterType>('all');

  const queryClient = useQueryClient();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', filterType],
    queryFn: () => activitiesApi.list(filterType !== 'all' ? { type: filterType as ActivityType } : undefined),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => activitiesApi.complete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  // Filter activities
  const filteredActivities = activities.filter(a => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!a.title.toLowerCase().includes(s) && !a.description?.toLowerCase().includes(s)) {
        return false;
      }
    }
    if (filterStatus === 'pending') return !a.completedAt;
    if (filterStatus === 'completed') return !!a.completedAt;
    if (filterStatus === 'overdue') return a.dueDate && !a.completedAt && new Date(a.dueDate) < new Date();
    return true;
  });

  // Stats
  const pendingCount = activities.filter(a => !a.completedAt).length;
  const completedCount = activities.filter(a => a.completedAt).length;
  const overdueCount = activities.filter(a => a.dueDate && !a.completedAt && new Date(a.dueDate) < new Date()).length;
  const todayCount = activities.filter(a => {
    if (!a.dueDate || a.completedAt) return false;
    const due = new Date(a.dueDate);
    const today = new Date();
    return due.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('pending')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('completed')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('overdue')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Activity className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Due Today</p>
              <p className="text-2xl font-bold">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="call">Calls</SelectItem>
            <SelectItem value="email">Emails</SelectItem>
            <SelectItem value="meeting">Meetings</SelectItem>
            <SelectItem value="task">Tasks</SelectItem>
            <SelectItem value="note">Notes</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(['all', 'pending', 'completed', 'overdue'] as FilterType[]).map(status => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button variant={viewMode === 'timeline' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('timeline')}>
            <Activity className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'cards' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('cards')}>
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
        <Button className="ml-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Activity
        </Button>
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : viewMode === 'timeline' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Timeline
              {filterStatus !== 'all' && (
                <Badge variant="secondary">{filterStatus}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline
              activities={filteredActivities}
              onComplete={(id) => completeMutation.mutate(id)}
              showCustomer
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActivities.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                No activities found
              </CardContent>
            </Card>
          ) : (
            filteredActivities.map(activity => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onComplete={(id) => completeMutation.mutate(id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
