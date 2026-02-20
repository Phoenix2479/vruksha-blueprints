import { useQuery } from '@tanstack/react-query';
import { Users, Crown, AlertTriangle, DollarSign, Briefcase, TrendingUp, Target, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@shared/components/ui';
import { formatCurrency } from '@shared/config/currency';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { customerApi, dealsApi, activitiesApi, analyticsApi } from '../api/crm360Api';

const COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];

export default function DashboardTab() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['crm-stats'],
    queryFn: customerApi.getStats,
  });

  const { data: pipelineStats = [] } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: dealsApi.getPipelineStats,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: () => activitiesApi.list(),
  });

  const { data: segmentation } = useQuery({
    queryKey: ['segmentation'],
    queryFn: analyticsApi.getSegmentation,
  });

  const pendingActivities = activities.filter(a => !a.completedAt).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={stats?.totalCustomers || 0}
          icon={Users}
          color="text-blue-600"
          bgColor="bg-blue-100"
          loading={statsLoading}
        />
        <StatCard
          title="VIP Customers"
          value={stats?.vip || 0}
          icon={Crown}
          color="text-amber-600"
          bgColor="bg-amber-100"
          loading={statsLoading}
        />
        <StatCard
          title="At Risk"
          value={stats?.atRisk || 0}
          icon={AlertTriangle}
          color="text-red-600"
          bgColor="bg-red-100"
          loading={statsLoading}
        />
        <StatCard
          title="Avg LTV"
          value={formatCurrency(stats?.avgLifetimeValue || 0, 'INR')}
          icon={DollarSign}
          color="text-green-600"
          bgColor="bg-green-100"
          loading={statsLoading}
          isText
        />
      </div>

      {/* Sales Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Deals"
          value={stats?.activeDeals || 0}
          icon={Briefcase}
          color="text-purple-600"
          bgColor="bg-purple-100"
          loading={statsLoading}
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(stats?.totalPipelineValue || 0, 'INR')}
          icon={TrendingUp}
          color="text-cyan-600"
          bgColor="bg-cyan-100"
          loading={statsLoading}
          isText
        />
        <StatCard
          title="Won Deals"
          value={stats?.wonDeals || 0}
          icon={Target}
          color="text-emerald-600"
          bgColor="bg-emerald-100"
          loading={statsLoading}
        />
        <StatCard
          title="Conversion Rate"
          value={`${(stats?.conversionRate || 0).toFixed(1)}%`}
          icon={Activity}
          color="text-indigo-600"
          bgColor="bg-indigo-100"
          loading={statsLoading}
          isText
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Deals Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineStats.filter(s => !['closed_won', 'closed_lost'].includes(s.stage))}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v, 'INR')} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Segmentation Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {segmentation ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={segmentation.segments}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="count"
                      nameKey="name"
                      label={({ name, percentage }) => `${name} (${percentage}%)`}
                    >
                      {segmentation.segments.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[200px] w-[200px] rounded-full" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Upcoming Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingActivities.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No pending activities</p>
          ) : (
            <div className="space-y-3">
              {pendingActivities.map(activity => (
                <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">{activity.title}</p>
                    <p className="text-sm text-muted-foreground">{activity.type} • {activity.priority} priority</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activity.dueDate ? new Date(activity.dueDate).toLocaleDateString() : 'No due date'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bgColor, loading, isText }: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  loading?: boolean;
  isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgColor}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">{isText ? value : value.toLocaleString()}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
