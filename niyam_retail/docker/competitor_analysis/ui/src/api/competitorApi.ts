import { createAPIClient } from '../../../../shared/utils/api';

const competitorAPI = createAPIClient('pricing');

// ============================================================================
// TYPES
// ============================================================================

export interface Competitor {
  id: number;
  name: string;
  website?: string;
  category: string;
  location?: string;
  status: 'active' | 'inactive' | 'monitoring';
  notes?: string;
  createdDate: string;
  lastUpdated?: string;
}

export interface CompetitorPrice {
  id: number;
  competitorId: number;
  competitorName?: string;
  productId: string;
  productName?: string;
  sku?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  inStock: boolean;
  url?: string;
  scrapedAt: string;
  priceChange?: number;
  changePercent?: number;
}

export interface PriceComparison {
  productId: string;
  productName: string;
  sku: string;
  ourPrice: number;
  competitorPrices: {
    competitorId: number;
    competitorName: string;
    price: number;
    difference: number;
    percentDiff: number;
  }[];
  lowestPrice: number;
  highestPrice: number;
  avgCompetitorPrice: number;
  pricePosition: 'lowest' | 'competitive' | 'highest' | 'above_avg';
}

export interface MarketTrend {
  category: string;
  avgPrice: number;
  priceChange: number;
  changePercent: number;
  competitorCount: number;
  trend: 'up' | 'down' | 'stable';
  data: { date: string; price: number }[];
}

export interface CompetitorAlert {
  id: number;
  type: 'price_drop' | 'price_increase' | 'out_of_stock' | 'back_in_stock' | 'new_product';
  competitorId: number;
  competitorName: string;
  productId?: string;
  productName?: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  data?: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface CompetitorStats {
  totalCompetitors: number;
  activeCompetitors: number;
  trackedProducts: number;
  alertsToday: number;
  priceChanges24h: number;
  avgPriceDiff: number;
  productsBelow: number;
  productsAbove: number;
}

export interface PriceWatch {
  id: number;
  productId: string;
  productName: string;
  targetPrice: number;
  currentLowest: number;
  status: 'watching' | 'triggered' | 'expired';
  competitorId?: number;
  createdDate: string;
  expiresAt?: string;
}

// ============================================================================
// HELPER MAPPERS
// ============================================================================

const mapCompetitor = (c: Record<string, unknown>): Competitor => ({
  id: c.id as number,
  name: c.name as string,
  website: c.website as string | undefined,
  category: c.category as string || 'General',
  location: c.location as string | undefined,
  status: (c.status as 'active' | 'inactive' | 'monitoring') || 'active',
  notes: c.notes as string | undefined,
  createdDate: c.created_date as string || c.created_at as string || new Date().toISOString(),
  lastUpdated: c.last_updated as string || c.updated_at as string,
});

const mapCompetitorPrice = (p: Record<string, unknown>): CompetitorPrice => ({
  id: p.id as number,
  competitorId: p.competitor_id as number,
  competitorName: p.competitor_name as string,
  productId: p.product_id as string,
  productName: p.product_name as string,
  sku: p.sku as string,
  price: parseFloat(p.price as string) || 0,
  originalPrice: p.original_price ? parseFloat(p.original_price as string) : undefined,
  currency: (p.currency as string) || 'INR',
  inStock: p.in_stock as boolean ?? true,
  url: p.url as string,
  scrapedAt: p.scraped_at as string || new Date().toISOString(),
  priceChange: p.price_change ? parseFloat(p.price_change as string) : undefined,
  changePercent: p.change_percent ? parseFloat(p.change_percent as string) : undefined,
});

const mapPriceComparison = (c: Record<string, unknown>): PriceComparison => ({
  productId: c.product_id as string,
  productName: c.product_name as string,
  sku: c.sku as string,
  ourPrice: parseFloat(c.our_price as string) || 0,
  competitorPrices: ((c.competitor_prices as Record<string, unknown>[]) || []).map((cp) => ({
    competitorId: cp.competitor_id as number,
    competitorName: cp.competitor_name as string,
    price: parseFloat(cp.price as string) || 0,
    difference: parseFloat(cp.difference as string) || 0,
    percentDiff: parseFloat(cp.percent_diff as string) || 0,
  })),
  lowestPrice: parseFloat(c.lowest_price as string) || 0,
  highestPrice: parseFloat(c.highest_price as string) || 0,
  avgCompetitorPrice: parseFloat(c.avg_competitor_price as string) || 0,
  pricePosition: c.price_position as PriceComparison['pricePosition'] || 'competitive',
});

const mapAlert = (a: Record<string, unknown>): CompetitorAlert => ({
  id: a.id as number,
  type: a.type as CompetitorAlert['type'],
  competitorId: a.competitor_id as number,
  competitorName: a.competitor_name as string,
  productId: a.product_id as string,
  productName: a.product_name as string,
  message: a.message as string,
  severity: (a.severity as 'low' | 'medium' | 'high') || 'medium',
  data: a.data as Record<string, unknown>,
  createdAt: a.created_at as string || new Date().toISOString(),
  read: a.read as boolean ?? false,
});

// ============================================================================
// COMPETITORS
// ============================================================================

export const competitorsApi = {
  list: async (): Promise<Competitor[]> => {
    const response = await competitorAPI.get('/competitors');
    return (response.data.competitors || []).map(mapCompetitor);
  },

  get: async (id: number): Promise<Competitor> => {
    const response = await competitorAPI.get(`/competitors/${id}`);
    return mapCompetitor(response.data.competitor);
  },

  create: async (data: {
    name: string;
    website?: string;
    category: string;
    location?: string;
    notes?: string;
  }): Promise<Competitor> => {
    const response = await competitorAPI.post('/competitors', data);
    return mapCompetitor(response.data.competitor);
  },

  update: async (id: number, data: Partial<{
    name: string;
    website: string;
    category: string;
    location: string;
    status: Competitor['status'];
    notes: string;
  }>): Promise<Competitor> => {
    const response = await competitorAPI.put(`/competitors/${id}`, data);
    return mapCompetitor(response.data.competitor);
  },

  delete: async (id: number): Promise<void> => {
    await competitorAPI.delete(`/competitors/${id}`);
  },

  getStats: async (): Promise<CompetitorStats> => {
    const response = await competitorAPI.get('/competitors/stats');
    const s = response.data;
    return {
      totalCompetitors: s.total_competitors || 0,
      activeCompetitors: s.active_competitors || 0,
      trackedProducts: s.tracked_products || 0,
      alertsToday: s.alerts_today || 0,
      priceChanges24h: s.price_changes_24h || 0,
      avgPriceDiff: parseFloat(s.avg_price_diff) || 0,
      productsBelow: s.products_below || 0,
      productsAbove: s.products_above || 0,
    };
  },
};

// ============================================================================
// COMPETITOR PRICES
// ============================================================================

export const competitorPricesApi = {
  list: async (params?: {
    competitorId?: number;
    productId?: string;
    category?: string;
  }): Promise<CompetitorPrice[]> => {
    const response = await competitorAPI.get('/competitor-prices', { params });
    return (response.data.prices || []).map(mapCompetitorPrice);
  },

  getLatest: async (competitorId: number): Promise<CompetitorPrice[]> => {
    const response = await competitorAPI.get(`/competitors/${competitorId}/prices/latest`);
    return (response.data.prices || []).map(mapCompetitorPrice);
  },

  add: async (data: {
    competitorId: number;
    productId: string;
    price: number;
    originalPrice?: number;
    inStock?: boolean;
    url?: string;
  }): Promise<CompetitorPrice> => {
    const response = await competitorAPI.post('/competitor-prices', {
      competitor_id: data.competitorId,
      product_id: data.productId,
      price: data.price,
      original_price: data.originalPrice,
      in_stock: data.inStock ?? true,
      url: data.url,
    });
    return mapCompetitorPrice(response.data.price);
  },

  scrape: async (competitorId: number, productUrls?: string[]): Promise<{ count: number; prices: CompetitorPrice[] }> => {
    const response = await competitorAPI.post(`/competitors/${competitorId}/scrape`, {
      product_urls: productUrls,
    });
    return {
      count: response.data.count || 0,
      prices: (response.data.prices || []).map(mapCompetitorPrice),
    };
  },

  getPriceHistory: async (competitorId: number, productId: string): Promise<{
    date: string;
    price: number;
  }[]> => {
    const response = await competitorAPI.get(`/competitor-prices/history`, {
      params: { competitor_id: competitorId, product_id: productId },
    });
    return (response.data.history || []).map((h: Record<string, unknown>) => ({
      date: h.date as string,
      price: parseFloat(h.price as string) || 0,
    }));
  },
};

// ============================================================================
// PRICE COMPARISON
// ============================================================================

export const priceComparisonApi = {
  compare: async (productIds?: string[]): Promise<PriceComparison[]> => {
    const response = await competitorAPI.get('/price-comparison', {
      params: { product_ids: productIds?.join(',') },
    });
    return (response.data.comparisons || []).map(mapPriceComparison);
  },

  compareByCategory: async (category: string): Promise<PriceComparison[]> => {
    const response = await competitorAPI.get('/price-comparison/category', {
      params: { category },
    });
    return (response.data.comparisons || []).map(mapPriceComparison);
  },

  getMarketPosition: async (): Promise<{
    overall: { below: number; competitive: number; above: number };
    byCategory: { category: string; position: string; avgDiff: number }[];
  }> => {
    const response = await competitorAPI.get('/price-comparison/market-position');
    return {
      overall: response.data.overall || { below: 0, competitive: 0, above: 0 },
      byCategory: response.data.by_category || [],
    };
  },
};

// ============================================================================
// MARKET TRENDS
// ============================================================================

export const marketTrendsApi = {
  getAll: async (): Promise<MarketTrend[]> => {
    const response = await competitorAPI.get('/market-trends');
    return (response.data.trends || []).map((t: Record<string, unknown>) => ({
      category: t.category as string,
      avgPrice: parseFloat(t.avg_price as string) || 0,
      priceChange: parseFloat(t.price_change as string) || 0,
      changePercent: parseFloat(t.change_percent as string) || 0,
      competitorCount: t.competitor_count as number || 0,
      trend: t.trend as MarketTrend['trend'] || 'stable',
      data: (t.data as { date: string; price: number }[]) || [],
    }));
  },

  getByCategory: async (category: string): Promise<MarketTrend> => {
    const response = await competitorAPI.get(`/market-trends/${encodeURIComponent(category)}`);
    const t = response.data.trend;
    return {
      category: t.category,
      avgPrice: parseFloat(t.avg_price) || 0,
      priceChange: parseFloat(t.price_change) || 0,
      changePercent: parseFloat(t.change_percent) || 0,
      competitorCount: t.competitor_count || 0,
      trend: t.trend || 'stable',
      data: t.data || [],
    };
  },
};

// ============================================================================
// ALERTS
// ============================================================================

export const alertsApi = {
  list: async (params?: {
    unreadOnly?: boolean;
    type?: CompetitorAlert['type'];
    severity?: CompetitorAlert['severity'];
  }): Promise<CompetitorAlert[]> => {
    const response = await competitorAPI.get('/competitor-alerts', {
      params: {
        unread_only: params?.unreadOnly,
        type: params?.type,
        severity: params?.severity,
      },
    });
    return (response.data.alerts || []).map(mapAlert);
  },

  markAsRead: async (id: number): Promise<void> => {
    await competitorAPI.put(`/competitor-alerts/${id}/read`);
  },

  markAllAsRead: async (): Promise<void> => {
    await competitorAPI.put('/competitor-alerts/mark-all-read');
  },

  delete: async (id: number): Promise<void> => {
    await competitorAPI.delete(`/competitor-alerts/${id}`);
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await competitorAPI.get('/competitor-alerts/unread-count');
    return response.data.count || 0;
  },
};

// ============================================================================
// PRICE WATCHES
// ============================================================================

export const priceWatchApi = {
  list: async (): Promise<PriceWatch[]> => {
    const response = await competitorAPI.get('/price-watches');
    return (response.data.watches || []).map((w: Record<string, unknown>) => ({
      id: w.id as number,
      productId: w.product_id as string,
      productName: w.product_name as string,
      targetPrice: parseFloat(w.target_price as string) || 0,
      currentLowest: parseFloat(w.current_lowest as string) || 0,
      status: w.status as PriceWatch['status'] || 'watching',
      competitorId: w.competitor_id as number,
      createdDate: w.created_date as string || new Date().toISOString(),
      expiresAt: w.expires_at as string,
    }));
  },

  create: async (data: {
    productId: string;
    targetPrice: number;
    competitorId?: number;
    expiresAt?: string;
  }): Promise<PriceWatch> => {
    const response = await competitorAPI.post('/price-watches', {
      product_id: data.productId,
      target_price: data.targetPrice,
      competitor_id: data.competitorId,
      expires_at: data.expiresAt,
    });
    const w = response.data.watch;
    return {
      id: w.id,
      productId: w.product_id,
      productName: w.product_name,
      targetPrice: parseFloat(w.target_price) || 0,
      currentLowest: parseFloat(w.current_lowest) || 0,
      status: w.status || 'watching',
      competitorId: w.competitor_id,
      createdDate: w.created_date || new Date().toISOString(),
      expiresAt: w.expires_at,
    };
  },

  delete: async (id: number): Promise<void> => {
    await competitorAPI.delete(`/price-watches/${id}`);
  },
};
