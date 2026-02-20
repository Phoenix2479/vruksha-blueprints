import React, { useEffect, useState } from 'react';
import { DollarSign, Users, Package, FileText, AlertCircle } from 'lucide-react';
import { StatsCard } from '../components/StatsCard';
import { SalesChart, type SalesData } from '../components/SalesChart';
import { RecentActivity, type ActivityItem } from '../components/RecentActivity';
import { QuickActions } from '../components/QuickActions';
import { getDashboardStats, getSalesData, getRecentActivity, checkServicesHealth } from '../api/dashboard';
import type { DashboardStats } from '../../../../shared/types/models.ts';
import { formatCurrency } from '../../../../shared/utils/formatting.ts';
import { TenantSwitcher } from '../../../../shared/components/index.ts';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    today_sales: 0,
    active_sessions: 0,
    low_stock_items: 0,
    pending_invoices: 0,
    overdue_invoices: 0,
  });
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [servicesHealth, setServicesHealth] = useState({ pos: false, billing: false, inventory: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, salesChartData, activityData, healthData] = await Promise.all([
        getDashboardStats(),
        getSalesData(7),
        getRecentActivity(),
        checkServicesHealth(),
      ]);

      setStats(statsData);
      setSalesData(salesChartData);
      setActivities(activityData);
      setServicesHealth(healthData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Niyam Retail Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Real-time overview of your retail operations
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full ${servicesHealth.pos ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {servicesHealth.pos && servicesHealth.billing && servicesHealth.inventory
                  ? 'All systems operational'
                  : 'Some services offline'}
              </span>
              <TenantSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Today's Sales"
            value={formatCurrency(stats.today_sales)}
            subtitle="Total revenue"
            icon={DollarSign}
            iconColor="text-green-600"
          />
          <StatsCard
            title="Active Sessions"
            value={stats.active_sessions}
            subtitle="Open registers"
            icon={Users}
            iconColor="text-blue-600"
          />
          <StatsCard
            title="Low Stock Items"
            value={stats.low_stock_items}
            subtitle="Need attention"
            icon={Package}
            iconColor="text-orange-600"
          />
          <StatsCard
            title="Pending Invoices"
            value={stats.pending_invoices}
            subtitle={`${stats.overdue_invoices} overdue`}
            icon={FileText}
            iconColor="text-purple-600"
          />
        </div>

        {/* Sales Chart & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <SalesChart data={salesData} loading={loading} />
          <RecentActivity activities={activities} loading={loading} />
        </div>

        {/* Quick Actions */}
        <QuickActions />

        {/* System Status */}
        <div className="mt-8 card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            System Status
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${servicesHealth.pos ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <p className="text-sm font-medium text-gray-900">Point of Sale</p>
                <p className="text-xs text-gray-500">Port 8815</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${servicesHealth.billing ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <p className="text-sm font-medium text-gray-900">Billing Engine</p>
                <p className="text-xs text-gray-500">Port 8812</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${servicesHealth.inventory ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <p className="text-sm font-medium text-gray-900">Inventory</p>
                <p className="text-xs text-gray-500">Port 8811</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
