import axios from 'axios';
import type {
  CustomerProfile, Deal, Activity, CRMStats, PipelineStats,
  CustomerFilters, DealFilters, ActivityFilters, DealStage,
  AIAction, AIActionsSummary, Consent, AuditEntry, CustomerJourney, SegmentationAnalysis
} from '../types/crm360';

const CRM_API_URL = import.meta.env.VITE_CRM_API_URL || 'http://localhost:8952';

const api = axios.create({
  baseURL: CRM_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
});

// Map backend customer to frontend CustomerProfile
const mapCustomer = (c: Record<string, unknown>): CustomerProfile => ({
  id: String(c.id),
  name: (c.name as string) || '',
  email: (c.email as string) || '',
  phone: c.phone as string,
  company: c.company as string,
  position: c.position as string,
  segment: (c.segment as CustomerProfile['segment']) || 'regular',
  lifetimeValue: parseFloat(String(c.lifetime_value)) || 0,
  totalOrders: parseInt(String(c.total_orders)) || 0,
  avgOrderValue: parseFloat(String(c.avg_order_value)) || 0,
  lastOrderDate: c.last_order_date as string,
  memberSince: (c.member_since || c.created_at) as string,
  preferences: c.preferences as string[],
  tags: c.tags as string[],
  address: c.address as string,
  notes: c.notes as string,
  status: c.status as string,
  source: c.source as string,
  createdAt: c.created_at as string,
  updatedAt: c.updated_at as string,
});

// Map backend deal to frontend Deal
const mapDeal = (d: Record<string, unknown>): Deal => ({
  id: String(d.id),
  title: (d.title as string) || '',
  value: parseFloat(String(d.value)) || 0,
  stage: (d.stage as DealStage) || 'qualification',
  probability: parseInt(String(d.probability)) || 0,
  customerId: d.customer_id as string,
  customer: d.customer ? mapCustomer(d.customer as Record<string, unknown>) : undefined,
  expectedCloseDate: d.expected_close_date as string,
  assignedTo: d.assigned_to as string,
  tags: (d.tags as string[]) || [],
  notes: d.notes as string,
  createdAt: d.created_at as string,
  updatedAt: d.updated_at as string,
});

// Map backend activity to frontend Activity
const mapActivity = (a: Record<string, unknown>): Activity => ({
  id: String(a.id),
  type: (a.type as Activity['type']) || 'task',
  title: (a.title as string) || '',
  description: a.description as string,
  customerId: a.customer_id as string,
  dealId: a.deal_id as string,
  dueDate: a.due_date as string,
  completedAt: a.completed_at as string,
  priority: (a.priority as Activity['priority']) || 'medium',
  assignedTo: a.assigned_to as string,
  createdAt: a.created_at as string,
});

// Customer API
export const customerApi = {
  list: async (params?: CustomerFilters): Promise<CustomerProfile[]> => {
    const response = await api.get('/customers', { params });
    return (response.data.customers || []).map(mapCustomer);
  },

  get: async (id: string): Promise<CustomerProfile> => {
    const response = await api.get(`/customers/${id}`);
    return mapCustomer(response.data.customer);
  },

  getActivity: async (id: string): Promise<Activity[]> => {
    const response = await api.get(`/customers/${id}/activity`);
    return (response.data.activity || []).map((a: Record<string, unknown>) => ({
      id: String(a.id),
      type: (a.type as Activity['type']) || 'purchase',
      title: (a.description as string) || '',
      description: (a.description as string) || '',
      customerId: id,
      priority: 'medium' as const,
      createdAt: (a.date as string) || '',
      value: parseFloat(String(a.value)) || 0,
    }));
  },

  getStats: async (): Promise<CRMStats> => {
    // Get customer stats
    const customerRes = await api.get('/customers/stats');
    const cs = customerRes.data;
    
    // Get pipeline stats
    const pipelineRes = await api.get('/deals/stats/pipeline');
    const ps = pipelineRes.data.summary || {};
    
    return {
      totalCustomers: cs.total_customers || 0,
      vip: cs.vip || 0,
      atRisk: cs.at_risk || 0,
      avgLifetimeValue: parseFloat(String(cs.avg_lifetime_value)) || 0,
      newLeads: 0,
      activeDeals: ps.active_deals || 0,
      totalPipelineValue: ps.pipeline_value || 0,
      wonDeals: ps.won_deals || 0,
      wonValue: ps.won_value || 0,
      conversionRate: ps.conversion_rate || 0,
      avgDealSize: ps.avg_deal_size || 0,
    };
  },

  create: async (data: { name: string; email?: string; phone?: string; address?: string; notes?: string; company?: string; position?: string }): Promise<CustomerProfile> => {
    const response = await api.post('/customers', data);
    return mapCustomer(response.data.customer);
  },

  update: async (id: string, data: Partial<CustomerProfile>): Promise<CustomerProfile> => {
    const response = await api.patch(`/customers/${id}`, data);
    return mapCustomer(response.data.customer);
  },

  getCLV: async (id: string) => {
    const response = await api.get(`/customers/${id}/clv`);
    return response.data;
  },
};

// Deals API - now using backend
export const dealsApi = {
  list: async (filters?: DealFilters): Promise<Deal[]> => {
    const params: Record<string, string> = {};
    if (filters?.stage) params.stage = filters.stage;
    if (filters?.customerId) params.customer_id = filters.customerId;
    if (filters?.search) params.search = filters.search;
    
    const response = await api.get('/deals', { params });
    return (response.data.deals || []).map(mapDeal);
  },

  get: async (id: string): Promise<Deal | undefined> => {
    const response = await api.get(`/deals/${id}`);
    return response.data.deal ? mapDeal(response.data.deal) : undefined;
  },

  create: async (data: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Deal> => {
    const response = await api.post('/deals', {
      title: data.title,
      value: data.value,
      stage: data.stage,
      probability: data.probability,
      customer_id: data.customerId,
      expected_close_date: data.expectedCloseDate,
      tags: data.tags,
      notes: data.notes,
    });
    return mapDeal(response.data.deal);
  },

  update: async (id: string, data: Partial<Deal>): Promise<Deal> => {
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.value !== undefined) payload.value = data.value;
    if (data.stage !== undefined) payload.stage = data.stage;
    if (data.probability !== undefined) payload.probability = data.probability;
    if (data.customerId !== undefined) payload.customer_id = data.customerId;
    if (data.expectedCloseDate !== undefined) payload.expected_close_date = data.expectedCloseDate;
    if (data.tags !== undefined) payload.tags = data.tags;
    if (data.notes !== undefined) payload.notes = data.notes;
    
    const response = await api.patch(`/deals/${id}`, payload);
    return mapDeal(response.data.deal);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/deals/${id}`);
  },

  getPipelineStats: async (): Promise<PipelineStats[]> => {
    const response = await api.get('/deals/stats/pipeline');
    return (response.data.pipeline || []).map((s: Record<string, unknown>) => ({
      stage: s.stage as DealStage,
      count: parseInt(String(s.count)) || 0,
      value: parseFloat(String(s.value)) || 0,
    }));
  },
};

// Activities API - now using backend
export const activitiesApi = {
  list: async (filters?: ActivityFilters): Promise<Activity[]> => {
    const params: Record<string, string> = {};
    if (filters?.customerId) params.customer_id = filters.customerId;
    if (filters?.dealId) params.deal_id = filters.dealId;
    if (filters?.type) params.type = filters.type;
    
    const response = await api.get('/activities', { params });
    return (response.data.activities || []).map(mapActivity);
  },

  get: async (id: string): Promise<Activity | undefined> => {
    const response = await api.get(`/activities/${id}`);
    return response.data.activity ? mapActivity(response.data.activity) : undefined;
  },

  create: async (data: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> => {
    const response = await api.post('/activities', {
      type: data.type,
      title: data.title,
      description: data.description,
      customer_id: data.customerId,
      deal_id: data.dealId,
      priority: data.priority,
      due_date: data.dueDate,
      assigned_to: data.assignedTo,
    });
    return mapActivity(response.data.activity);
  },

  update: async (id: string, data: Partial<Activity>): Promise<Activity> => {
    const payload: Record<string, unknown> = {};
    if (data.type !== undefined) payload.type = data.type;
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.customerId !== undefined) payload.customer_id = data.customerId;
    if (data.dealId !== undefined) payload.deal_id = data.dealId;
    if (data.priority !== undefined) payload.priority = data.priority;
    if (data.dueDate !== undefined) payload.due_date = data.dueDate;
    if (data.assignedTo !== undefined) payload.assigned_to = data.assignedTo;
    
    const response = await api.patch(`/activities/${id}`, payload);
    return mapActivity(response.data.activity);
  },

  complete: async (id: string): Promise<Activity> => {
    const response = await api.post(`/activities/${id}/complete`);
    return mapActivity(response.data.activity);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/activities/${id}`);
  },

  getStats: async () => {
    const response = await api.get('/activities/stats/summary');
    return response.data.summary;
  },
};

// AI Actions API
export const aiActionsApi = {
  list: async (status = 'all'): Promise<{ actions: AIAction[]; summary: AIActionsSummary }> => {
    const res = await api.get(`/ai/actions?status=${status}`);
    return res.data;
  },

  approve: async (id: string, status: string, reason?: string): Promise<AIAction> => {
    const res = await api.patch(`/ai/actions/${id}`, { status, override_reason: reason });
    return res.data.action;
  },

  execute: async (id: string): Promise<AIAction> => {
    const res = await api.post(`/ai/actions/${id}/execute`);
    return res.data.action;
  },

  create: async (data: Partial<AIAction>): Promise<AIAction> => {
    const res = await api.post('/ai/actions', data);
    return res.data.action;
  },
};

// Privacy API
export const privacyApi = {
  getConsent: async (customerId: string): Promise<{ consents: Consent[] }> => {
    const res = await api.get(`/privacy/consent/${customerId}`);
    return res.data;
  },

  updateConsent: async (customerId: string, consentType: string, granted: boolean): Promise<Consent> => {
    const res = await api.post('/privacy/consent', { customer_id: customerId, consent_type: consentType, granted });
    return res.data.consent;
  },

  exportData: async (customerId: string) => {
    const res = await api.get(`/privacy/export/${customerId}`);
    return res.data;
  },

  requestDeletion: async (customerId: string, reason?: string) => {
    const res = await api.post('/privacy/deletion-request', { customer_id: customerId, reason });
    return res.data;
  },
};

// Audit API
export const auditApi = {
  getTrail: async (limit = 50): Promise<{ entries: AuditEntry[] }> => {
    const res = await api.get(`/audit/trail?limit=${limit}`);
    return res.data;
  },
};

// Journey API
export const journeyApi = {
  get: async (customerId: string): Promise<CustomerJourney> => {
    const res = await api.get(`/journey/${customerId}`);
    return res.data;
  },

  addEvent: async (customerId: string, eventType: string, channel: string, metadata?: Record<string, unknown>) => {
    const res = await api.post('/journey/events', { customer_id: customerId, event_type: eventType, channel, metadata });
    return res.data;
  },
};

// Analytics API
export const analyticsApi = {
  getSegmentation: async (): Promise<SegmentationAnalysis> => {
    const res = await api.get('/analytics/segmentation');
    return res.data;
  },

  getChurnPrediction: async () => {
    const res = await api.get('/analytics/churn-prediction');
    return res.data;
  },

  getRFM: async () => {
    const res = await api.get('/analytics/rfm');
    return res.data;
  },
};

// Loyalty API
export const loyaltyApi = {
  issuePoints: async (customerId: string, points: number, reason?: string) => {
    const res = await api.post('/loyalty/issue', { customer_id: customerId, points, reason });
    return res.data;
  },

  redeemPoints: async (customerId: string, points: number, reason?: string) => {
    const res = await api.post('/loyalty/redeem', { customer_id: customerId, points, reason });
    return res.data;
  },
};

// Combined export for convenience
export const crm360Api = {
  customers: customerApi,
  deals: dealsApi,
  activities: activitiesApi,
  aiActions: aiActionsApi,
  privacy: privacyApi,
  audit: auditApi,
  journey: journeyApi,
  analytics: analyticsApi,
  loyalty: loyaltyApi,
};

export default crm360Api;
