import { posAPI, billingAPI, inventoryAPI } from '../../../../shared/utils/api.ts';
import type { DashboardStats, RevenueSummary } from '../../../../shared/types/models.ts';
import type { SalesData } from '../components/SalesChart';
import type { ActivityItem } from '../components/RecentActivity';

// Get dashboard stats
export const getDashboardStats = async (): Promise<DashboardStats> => {
  try {
    // In a real implementation, this would be a dedicated endpoint
    // For now, we'll aggregate from multiple services
    
    const [revenueResponse] = await Promise.all([
      billingAPI.get<{ revenue_summary: RevenueSummary }>('/revenue/summary').catch(() => null),
    ]);

    return {
      today_sales: revenueResponse?.data?.revenue_summary?.total_revenue || 0,
      active_sessions: 0, // Would come from POS API
      low_stock_items: 0, // Would come from Inventory API
      pending_invoices: 0, // Would come from Billing API
      overdue_invoices: 0,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return {
      today_sales: 0,
      active_sessions: 0,
      low_stock_items: 0,
      pending_invoices: 0,
      overdue_invoices: 0,
    };
  }
};

// Get sales chart data
export const getSalesData = async (days: number = 7): Promise<SalesData[]> => {
  try {
    // Mock data for now - in production, this would come from analytics API
    const mockData: SalesData[] = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      mockData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: Math.floor(Math.random() * 5000) + 1000,
        transactions: Math.floor(Math.random() * 50) + 10,
      });
    }
    
    return mockData;
  } catch (error) {
    console.error('Error fetching sales data:', error);
    return [];
  }
};

// Get recent activity
export const getRecentActivity = async (): Promise<ActivityItem[]> => {
  try {
    // Mock data for now - in production, would aggregate from multiple services
    const now = new Date();
    
    return [
      {
        id: '1',
        type: 'sale',
        title: 'Sale completed - TXN-12345',
        description: '3 items, cash payment',
        amount: 250.50,
        timestamp: new Date(now.getTime() - 2 * 60000).toISOString(),
      },
      {
        id: '2',
        type: 'invoice',
        title: 'Invoice created - INV-001',
        description: 'ACME Corp',
        amount: 1250.00,
        timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
      },
      {
        id: '3',
        type: 'payment',
        title: 'Payment received',
        description: 'Invoice INV-002 paid',
        amount: 750.00,
        timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
      },
      {
        id: '4',
        type: 'alert',
        title: 'Low stock alert',
        description: 'Product SKU-123 below reorder point',
        timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
      },
    ];
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return [];
  }
};

// Check service health
export const checkServicesHealth = async () => {
  const results = {
    pos: false,
    billing: false,
    inventory: false,
  };

  try {
    await posAPI.get('/healthz');
    results.pos = true;
  } catch (error) {
    console.error('POS health check failed:', error);
  }

  try {
    await billingAPI.get('/healthz');
    results.billing = true;
  } catch (error) {
    console.error('Billing health check failed:', error);
  }

  try {
    await inventoryAPI.get('/healthz');
    results.inventory = true;
  } catch (error) {
    console.error('Inventory health check failed:', error);
  }

  return results;
};
