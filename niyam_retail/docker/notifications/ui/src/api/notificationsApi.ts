import { createAPIClient } from '../../../../shared/utils/api';
const notifAPI = createAPIClient('notifications');

export interface Notification {
  id: number; type: 'info' | 'warning' | 'error' | 'success';
  category: 'inventory' | 'sales' | 'customer' | 'system' | 'order';
  title: string; message: string;
  read: boolean; actionUrl?: string; actionLabel?: string;
  createdAt: string;
}

export interface NotificationSettings {
  emailEnabled: boolean; pushEnabled: boolean;
  categories: { [key: string]: boolean };
}

export interface NotificationStats {
  total: number; unread: number; byCategory: { [key: string]: number };
}

const mapNotification = (n: Record<string, unknown>): Notification => ({
  id: n.id as number, type: n.type as Notification['type'] || 'info',
  category: n.category as Notification['category'] || 'system',
  title: n.title as string, message: n.message as string,
  read: n.read as boolean ?? false, actionUrl: n.action_url as string,
  actionLabel: n.action_label as string, createdAt: n.created_at as string,
});

export const notificationsApi = {
  list: async (params?: { unreadOnly?: boolean; category?: string }): Promise<Notification[]> => {
    const response = await notifAPI.get('/list', { params });
    return (response.data.notifications || []).map(mapNotification);
  },
  markRead: async (id: number): Promise<void> => { await notifAPI.post(`/${id}/read`); },
  markAllRead: async (): Promise<void> => { await notifAPI.post('/read-all'); },
  delete: async (id: number): Promise<void> => { await notifAPI.delete(`/${id}`); },
  getStats: async (): Promise<NotificationStats> => {
    const response = await notifAPI.get('/stats');
    const s = response.data;
    return { total: s.total || 0, unread: s.unread || 0, byCategory: s.by_category || {} };
  },
  getSettings: async (): Promise<NotificationSettings> => {
    const response = await notifAPI.get('/settings');
    return response.data.settings;
  },
  updateSettings: async (settings: Partial<NotificationSettings>): Promise<void> => {
    await notifAPI.put('/settings', settings);
  },
};
