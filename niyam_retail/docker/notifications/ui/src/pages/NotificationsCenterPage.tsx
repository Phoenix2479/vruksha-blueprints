import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification, type NotificationStats } from '../api/notificationsApi';
import { Card, CardContent, CardHeader, CardTitle, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, Skeleton, Badge } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard } from '../../../../shared/components/blocks';
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, AlertCircle, CheckCircle, ExternalLink, Package, ShoppingCart, Users, Settings } from 'lucide-react';

export default function NotificationsCenterPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const { data: stats } = useQuery<NotificationStats>({ queryKey: ['notification-stats'], queryFn: notificationsApi.getStats });
  const { data: notifications = [], isLoading } = useQuery({ queryKey: ['notifications', filterCategory], queryFn: () => notificationsApi.list({ category: filterCategory !== 'all' ? filterCategory : undefined }) });

  const markReadMutation = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['notification-stats'] }); } });
  const markAllReadMutation = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['notification-stats'] }); } });
  const deleteMutation = useMutation({ mutationFn: notificationsApi.delete, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['notification-stats'] }); } });

  const unread = notifications.filter(n => !n.read);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Bell className="h-7 w-7 text-blue-600" />
            <div><h1 className="text-xl font-bold">Notifications</h1><p className="text-sm text-muted-foreground">System alerts & updates</p></div>
          </div>
          <Button variant="outline" onClick={() => markAllReadMutation.mutate()} disabled={unread.length === 0}><CheckCheck className="h-4 w-4 mr-1" /> Mark All Read</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total" value={`${stats?.total || 0}`} icon={Bell} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
          <StatsCard title="Unread" value={`${stats?.unread || 0}`} icon={Bell} iconColor="text-red-600" iconBgColor="bg-red-100" />
          <StatsCard title="Inventory" value={`${stats?.byCategory?.inventory || 0}`} icon={Package} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
          <StatsCard title="Orders" value={`${stats?.byCategory?.order || 0}`} icon={ShoppingCart} iconColor="text-green-600" iconBgColor="bg-green-100" />
        </div>

        <div className="flex items-center gap-4">
          <Select value={filterCategory} onValueChange={setFilterCategory}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem><SelectItem value="inventory">Inventory</SelectItem><SelectItem value="sales">Sales</SelectItem><SelectItem value="customer">Customer</SelectItem><SelectItem value="order">Order</SelectItem><SelectItem value="system">System</SelectItem></SelectContent></Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
            <TabsTrigger value="unread">Unread ({unread.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6"><NotificationList notifications={notifications} isLoading={isLoading} onMarkRead={id => markReadMutation.mutate(id)} onDelete={id => deleteMutation.mutate(id)} /></TabsContent>
          <TabsContent value="unread" className="mt-6"><NotificationList notifications={unread} isLoading={isLoading} onMarkRead={id => markReadMutation.mutate(id)} onDelete={id => deleteMutation.mutate(id)} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function NotificationList({ notifications, isLoading, onMarkRead, onDelete }: { notifications: Notification[]; isLoading: boolean; onMarkRead: (id: number) => void; onDelete: (id: number) => void }) {
  if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>;
  if (notifications.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">No notifications</CardContent></Card>;

  const typeIcons = { info: Info, warning: AlertTriangle, error: AlertCircle, success: CheckCircle };
  const typeColors = { info: 'text-blue-600 bg-blue-100', warning: 'text-amber-600 bg-amber-100', error: 'text-red-600 bg-red-100', success: 'text-green-600 bg-green-100' };

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2 pr-4">
        {notifications.map(n => {
          const Icon = typeIcons[n.type];
          return (
            <Card key={n.id} className={!n.read ? 'border-l-4 border-l-blue-500 bg-blue-50/30' : ''}>
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${typeColors[n.type]}`}><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div><h4 className={`font-medium ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</h4><p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p></div>
                      <Badge variant="outline" className="shrink-0">{n.category}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                      <div className="flex gap-1">
                        {n.actionUrl && <Button variant="ghost" size="sm" asChild><a href={n.actionUrl}><ExternalLink className="h-3 w-3 mr-1" />{n.actionLabel || 'View'}</a></Button>}
                        {!n.read && <Button variant="ghost" size="sm" onClick={() => onMarkRead(n.id)}><Check className="h-3 w-3" /></Button>}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(n.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
