import { createAPIClient } from '@/lib/api';

const marketingAPI = createAPIClient('marketing');

// ============================================================================
// TYPES
// ============================================================================

export interface Campaign {
  id: number;
  name: string;
  type: 'email' | 'sms' | 'push' | 'social' | 'in-store' | 'multi-channel';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  targetAudience: {
    segments: string[];
    filters: Record<string, unknown>;
    estimatedReach: number;
  };
  content: {
    subject?: string;
    body: string;
    mediaUrls?: string[];
    cta?: { text: string; url: string };
  };
  schedule: {
    startDate: string;
    endDate?: string;
    timezone: string;
    frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
  };
  budget?: {
    allocated: number;
    spent: number;
    currency: string;
  };
  metrics: CampaignMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  unsubscribed: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  roi: number;
}

export interface Promotion {
  id: number;
  name: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'bundle' | 'shipping' | 'loyalty_points';
  value: number;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perCustomerLimit?: number;
  applicableTo: {
    products?: string[];
    categories?: string[];
    customers?: string[];
    channels?: string[];
  };
  validFrom: string;
  validTo: string;
  status: 'active' | 'scheduled' | 'expired' | 'disabled';
  terms?: string;
  createdAt: string;
}

export interface CustomerSegment {
  id: number;
  name: string;
  description?: string;
  criteria: {
    field: string;
    operator: string;
    value: unknown;
  }[];
  customerCount: number;
  tags: string[];
  isAutomatic: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  category: 'promotional' | 'transactional' | 'newsletter' | 'welcome' | 'abandoned_cart' | 'review_request';
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables: string[];
  thumbnail?: string;
  isActive: boolean;
  createdAt: string;
}

export interface MarketingStats {
  activeCampaigns: number;
  scheduledCampaigns: number;
  totalReach: number;
  totalConversions: number;
  totalRevenue: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgConversionRate: number;
  activePromotions: number;
  promotionRedemptions: number;
}

export interface CampaignCreateInput {
  name: string;
  type: Campaign['type'];
  targetAudience: Campaign['targetAudience'];
  content: Campaign['content'];
  schedule: Campaign['schedule'];
  budget?: Campaign['budget'];
}

export interface PromotionCreateInput {
  name: string;
  code: string;
  type: Promotion['type'];
  value: number;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  applicableTo?: Promotion['applicableTo'];
  validFrom: string;
  validTo: string;
  terms?: string;
}

export interface SegmentCreateInput {
  name: string;
  description?: string;
  criteria: CustomerSegment['criteria'];
  tags?: string[];
}

export interface TemplateCreateInput {
  name: string;
  category: EmailTemplate['category'];
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables?: string[];
}

export interface ABTest {
  id: number;
  campaignId: number;
  name: string;
  variants: {
    id: string;
    name: string;
    content: Campaign['content'];
    traffic: number;
    metrics: CampaignMetrics;
  }[];
  winner?: string;
  status: 'running' | 'completed' | 'cancelled';
  startedAt: string;
  endedAt?: string;
}

// ============================================================================
// MAPPERS
// ============================================================================

const mapCampaign = (c: Record<string, unknown>): Campaign => ({
  id: c.id as number,
  name: c.name as string,
  type: c.type as Campaign['type'] || 'email',
  status: c.status as Campaign['status'] || 'draft',
  targetAudience: {
    segments: (c.target_audience as Record<string, unknown>)?.segments as string[] || [],
    filters: (c.target_audience as Record<string, unknown>)?.filters as Record<string, unknown> || {},
    estimatedReach: (c.target_audience as Record<string, unknown>)?.estimated_reach as number || 0,
  },
  content: {
    subject: (c.content as Record<string, unknown>)?.subject as string,
    body: (c.content as Record<string, unknown>)?.body as string || '',
    mediaUrls: (c.content as Record<string, unknown>)?.media_urls as string[],
    cta: (c.content as Record<string, unknown>)?.cta as { text: string; url: string },
  },
  schedule: {
    startDate: (c.schedule as Record<string, unknown>)?.start_date as string || new Date().toISOString(),
    endDate: (c.schedule as Record<string, unknown>)?.end_date as string,
    timezone: (c.schedule as Record<string, unknown>)?.timezone as string || 'UTC',
    frequency: (c.schedule as Record<string, unknown>)?.frequency as Campaign['schedule']['frequency'],
  },
  budget: c.budget ? {
    allocated: parseFloat((c.budget as Record<string, unknown>).allocated as string) || 0,
    spent: parseFloat((c.budget as Record<string, unknown>).spent as string) || 0,
    currency: (c.budget as Record<string, unknown>).currency as string || 'INR',
  } : undefined,
  metrics: {
    sent: (c.metrics as Record<string, unknown>)?.sent as number || 0,
    delivered: (c.metrics as Record<string, unknown>)?.delivered as number || 0,
    opened: (c.metrics as Record<string, unknown>)?.opened as number || 0,
    clicked: (c.metrics as Record<string, unknown>)?.clicked as number || 0,
    converted: (c.metrics as Record<string, unknown>)?.converted as number || 0,
    unsubscribed: (c.metrics as Record<string, unknown>)?.unsubscribed as number || 0,
    revenue: parseFloat((c.metrics as Record<string, unknown>)?.revenue as string) || 0,
    openRate: parseFloat((c.metrics as Record<string, unknown>)?.open_rate as string) || 0,
    clickRate: parseFloat((c.metrics as Record<string, unknown>)?.click_rate as string) || 0,
    conversionRate: parseFloat((c.metrics as Record<string, unknown>)?.conversion_rate as string) || 0,
    roi: parseFloat((c.metrics as Record<string, unknown>)?.roi as string) || 0,
  },
  createdBy: c.created_by as string || '',
  createdAt: c.created_at as string || new Date().toISOString(),
  updatedAt: c.updated_at as string,
});

const mapPromotion = (p: Record<string, unknown>): Promotion => ({
  id: p.id as number,
  name: p.name as string,
  code: p.code as string,
  type: p.type as Promotion['type'] || 'percentage',
  value: parseFloat(p.value as string) || 0,
  minPurchase: p.min_purchase ? parseFloat(p.min_purchase as string) : undefined,
  maxDiscount: p.max_discount ? parseFloat(p.max_discount as string) : undefined,
  usageLimit: p.usage_limit as number,
  usedCount: p.used_count as number || 0,
  perCustomerLimit: p.per_customer_limit as number,
  applicableTo: {
    products: (p.applicable_to as Record<string, unknown>)?.products as string[],
    categories: (p.applicable_to as Record<string, unknown>)?.categories as string[],
    customers: (p.applicable_to as Record<string, unknown>)?.customers as string[],
    channels: (p.applicable_to as Record<string, unknown>)?.channels as string[],
  },
  validFrom: p.valid_from as string || new Date().toISOString(),
  validTo: p.valid_to as string || new Date().toISOString(),
  status: p.status as Promotion['status'] || 'active',
  terms: p.terms as string,
  createdAt: p.created_at as string || new Date().toISOString(),
});

const mapSegment = (s: Record<string, unknown>): CustomerSegment => ({
  id: s.id as number,
  name: s.name as string,
  description: s.description as string,
  criteria: (s.criteria as { field: string; operator: string; value: unknown }[]) || [],
  customerCount: s.customer_count as number || 0,
  tags: (s.tags as string[]) || [],
  isAutomatic: s.is_automatic as boolean ?? false,
  createdAt: s.created_at as string || new Date().toISOString(),
  updatedAt: s.updated_at as string,
});

const mapTemplate = (t: Record<string, unknown>): EmailTemplate => ({
  id: t.id as number,
  name: t.name as string,
  category: t.category as EmailTemplate['category'] || 'promotional',
  subject: t.subject as string || '',
  htmlContent: t.html_content as string || '',
  textContent: t.text_content as string,
  variables: (t.variables as string[]) || [],
  thumbnail: t.thumbnail as string,
  isActive: t.is_active as boolean ?? true,
  createdAt: t.created_at as string || new Date().toISOString(),
});

// ============================================================================
// CAMPAIGNS API
// ============================================================================

export const campaignsApi = {
  list: async (params?: { status?: Campaign['status']; type?: Campaign['type'] }): Promise<Campaign[]> => {
    const response = await marketingAPI.get('/campaigns', { params });
    return (response.data.campaigns || []).map(mapCampaign);
  },

  get: async (id: number): Promise<Campaign> => {
    const response = await marketingAPI.get(`/campaigns/${id}`);
    return mapCampaign(response.data.campaign);
  },

  create: async (data: CampaignCreateInput): Promise<Campaign> => {
    const response = await marketingAPI.post('/campaigns', {
      name: data.name,
      type: data.type,
      target_audience: {
        segments: data.targetAudience.segments,
        filters: data.targetAudience.filters,
      },
      content: {
        subject: data.content.subject,
        body: data.content.body,
        media_urls: data.content.mediaUrls,
        cta: data.content.cta,
      },
      schedule: {
        start_date: data.schedule.startDate,
        end_date: data.schedule.endDate,
        timezone: data.schedule.timezone,
        frequency: data.schedule.frequency,
      },
      budget: data.budget,
    });
    return mapCampaign(response.data.campaign);
  },

  update: async (id: number, data: Partial<CampaignCreateInput>): Promise<Campaign> => {
    const response = await marketingAPI.put(`/campaigns/${id}`, data);
    return mapCampaign(response.data.campaign);
  },

  delete: async (id: number): Promise<void> => {
    await marketingAPI.delete(`/campaigns/${id}`);
  },

  launch: async (id: number): Promise<Campaign> => {
    const response = await marketingAPI.post(`/campaigns/${id}/launch`);
    return mapCampaign(response.data.campaign);
  },

  pause: async (id: number): Promise<Campaign> => {
    const response = await marketingAPI.post(`/campaigns/${id}/pause`);
    return mapCampaign(response.data.campaign);
  },

  getMetrics: async (id: number): Promise<CampaignMetrics> => {
    const response = await marketingAPI.get(`/campaigns/${id}/metrics`);
    return response.data.metrics;
  },

  getStats: async (): Promise<MarketingStats> => {
    const response = await marketingAPI.get('/campaigns/stats');
    const s = response.data;
    return {
      activeCampaigns: s.active_campaigns || 0,
      scheduledCampaigns: s.scheduled_campaigns || 0,
      totalReach: s.total_reach || 0,
      totalConversions: s.total_conversions || 0,
      totalRevenue: parseFloat(s.total_revenue) || 0,
      avgOpenRate: parseFloat(s.avg_open_rate) || 0,
      avgClickRate: parseFloat(s.avg_click_rate) || 0,
      avgConversionRate: parseFloat(s.avg_conversion_rate) || 0,
      activePromotions: s.active_promotions || 0,
      promotionRedemptions: s.promotion_redemptions || 0,
    };
  },
};

// ============================================================================
// PROMOTIONS API
// ============================================================================

export const promotionsApi = {
  list: async (params?: { status?: Promotion['status'] }): Promise<Promotion[]> => {
    const response = await marketingAPI.get('/promotions', { params });
    return (response.data.promotions || []).map(mapPromotion);
  },

  get: async (id: number): Promise<Promotion> => {
    const response = await marketingAPI.get(`/promotions/${id}`);
    return mapPromotion(response.data.promotion);
  },

  create: async (data: PromotionCreateInput): Promise<Promotion> => {
    const response = await marketingAPI.post('/promotions', {
      name: data.name,
      code: data.code,
      type: data.type,
      value: data.value,
      min_purchase: data.minPurchase,
      max_discount: data.maxDiscount,
      usage_limit: data.usageLimit,
      per_customer_limit: data.perCustomerLimit,
      applicable_to: data.applicableTo,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      terms: data.terms,
    });
    return mapPromotion(response.data.promotion);
  },

  update: async (id: number, data: Partial<PromotionCreateInput>): Promise<Promotion> => {
    const response = await marketingAPI.put(`/promotions/${id}`, data);
    return mapPromotion(response.data.promotion);
  },

  delete: async (id: number): Promise<void> => {
    await marketingAPI.delete(`/promotions/${id}`);
  },

  validate: async (code: string, cartTotal: number): Promise<{
    valid: boolean;
    discount: number;
    message?: string;
  }> => {
    const response = await marketingAPI.post('/promotions/validate', { code, cart_total: cartTotal });
    return {
      valid: response.data.valid,
      discount: parseFloat(response.data.discount) || 0,
      message: response.data.message,
    };
  },
};

// ============================================================================
// SEGMENTS API
// ============================================================================

export const segmentsApi = {
  list: async (): Promise<CustomerSegment[]> => {
    const response = await marketingAPI.get('/segments');
    return (response.data.segments || []).map(mapSegment);
  },

  get: async (id: number): Promise<CustomerSegment> => {
    const response = await marketingAPI.get(`/segments/${id}`);
    return mapSegment(response.data.segment);
  },

  create: async (data: SegmentCreateInput): Promise<CustomerSegment> => {
    const response = await marketingAPI.post('/segments', data);
    return mapSegment(response.data.segment);
  },

  update: async (id: number, data: Partial<SegmentCreateInput>): Promise<CustomerSegment> => {
    const response = await marketingAPI.put(`/segments/${id}`, data);
    return mapSegment(response.data.segment);
  },

  delete: async (id: number): Promise<void> => {
    await marketingAPI.delete(`/segments/${id}`);
  },

  refresh: async (id: number): Promise<CustomerSegment> => {
    const response = await marketingAPI.post(`/segments/${id}/refresh`);
    return mapSegment(response.data.segment);
  },
};

// ============================================================================
// TEMPLATES API
// ============================================================================

export const templatesApi = {
  list: async (params?: { category?: EmailTemplate['category'] }): Promise<EmailTemplate[]> => {
    const response = await marketingAPI.get('/templates', { params });
    return (response.data.templates || []).map(mapTemplate);
  },

  get: async (id: number): Promise<EmailTemplate> => {
    const response = await marketingAPI.get(`/templates/${id}`);
    return mapTemplate(response.data.template);
  },

  create: async (data: TemplateCreateInput): Promise<EmailTemplate> => {
    const response = await marketingAPI.post('/templates', {
      name: data.name,
      category: data.category,
      subject: data.subject,
      html_content: data.htmlContent,
      text_content: data.textContent,
      variables: data.variables,
    });
    return mapTemplate(response.data.template);
  },

  update: async (id: number, data: Partial<TemplateCreateInput>): Promise<EmailTemplate> => {
    const response = await marketingAPI.put(`/templates/${id}`, data);
    return mapTemplate(response.data.template);
  },

  delete: async (id: number): Promise<void> => {
    await marketingAPI.delete(`/templates/${id}`);
  },

  preview: async (id: number, variables?: Record<string, string>): Promise<string> => {
    const response = await marketingAPI.post(`/templates/${id}/preview`, { variables });
    return response.data.html;
  },
};
