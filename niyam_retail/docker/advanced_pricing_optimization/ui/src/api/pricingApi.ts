// Pricing Optimizer API - Real backend integration
import { pricingAPI, inventoryAPI } from '../../../../shared/utils/api';

// ============================================================================
// TYPES
// ============================================================================

export interface PricingModel {
  id: number;
  productId: string;
  productName?: string;
  basePrice: number;
  modelName: string;
  modelParameters: {
    demandWeight: number;
    competitionWeight: number;
    seasonalityWeight: number;
    inventoryWeight: number;
  };
  status: 'active' | 'inactive' | 'testing';
  createdDate: string;
  updatedDate?: string;
}

export interface PriceCalculation {
  id: number;
  modelId: number;
  basePrice: number;
  calculatedPrice: number;
  factors: {
    demandFactor: number;
    competitionFactor: number;
    seasonalityFactor: number;
    inventoryFactor: number;
  };
  calculationDate: string;
}

export interface OptimizationRule {
  id: number;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  status: 'active' | 'inactive';
  priority: number;
  createdDate: string;
}

export interface RuleCondition {
  field: 'demand' | 'competition' | 'inventory' | 'seasonality' | 'margin' | 'dayOfWeek' | 'timeOfDay';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  value: number | [number, number];
}

export interface RuleAction {
  type: 'adjust_price' | 'set_price' | 'apply_discount' | 'alert';
  value: number;
  unit?: 'percent' | 'fixed';
}

export interface PricingStats {
  totalPricingModels: number;
  activePricingModels: number;
  totalOptimizationRules: number;
  activeOptimizationRules: number;
  totalPriceCalculations: number;
  averagePriceChange: number;
}

export interface MarketData {
  highDemand?: boolean;
  lowCompetition?: boolean;
  peakSeason?: boolean;
  lowInventory?: boolean;
  competitorPrices?: { competitorId: string; price: number }[];
}

export interface BulkPriceUpdate {
  productId: string;
  currentPrice: number;
  suggestedPrice: number;
  priceChange: number;
  changePercent: number;
  reason: string;
}

// ============================================================================
// PRICING MODELS
// ============================================================================

export const pricingModelApi = {
  list: async (): Promise<PricingModel[]> => {
    const response = await pricingAPI.get('/models');
    return (response.data.pricing_models || []).map(mapPricingModel);
  },

  get: async (id: number): Promise<PricingModel> => {
    const response = await pricingAPI.get(`/models/${id}`);
    return mapPricingModel(response.data.model);
  },

  getByProduct: async (productId: string): Promise<PricingModel | null> => {
    const response = await pricingAPI.get(`/models/product/${productId}`);
    return response.data.model ? mapPricingModel(response.data.model) : null;
  },

  create: async (data: {
    productId: string;
    basePrice: number;
    modelName: string;
    modelParameters?: Partial<PricingModel['modelParameters']>;
  }): Promise<PricingModel> => {
    const response = await pricingAPI.post('/models', {
      product_id: data.productId,
      base_price: data.basePrice,
      model_name: data.modelName,
      model_parameters: {
        demand_weight: data.modelParameters?.demandWeight ?? 0.25,
        competition_weight: data.modelParameters?.competitionWeight ?? 0.25,
        seasonality_weight: data.modelParameters?.seasonalityWeight ?? 0.25,
        inventory_weight: data.modelParameters?.inventoryWeight ?? 0.25,
      },
    });
    return mapPricingModel(response.data.model);
  },

  update: async (id: number, data: Partial<{
    basePrice: number;
    modelName: string;
    modelParameters: Partial<PricingModel['modelParameters']>;
    status: PricingModel['status'];
  }>): Promise<PricingModel> => {
    const payload: Record<string, unknown> = {};
    if (data.basePrice !== undefined) payload.base_price = data.basePrice;
    if (data.modelName !== undefined) payload.model_name = data.modelName;
    if (data.status !== undefined) payload.status = data.status;
    if (data.modelParameters) {
      payload.model_parameters = {
        demand_weight: data.modelParameters.demandWeight,
        competition_weight: data.modelParameters.competitionWeight,
        seasonality_weight: data.modelParameters.seasonalityWeight,
        inventory_weight: data.modelParameters.inventoryWeight,
      };
    }
    const response = await pricingAPI.patch(`/models/${id}`, payload);
    return mapPricingModel(response.data.model);
  },

  delete: async (id: number): Promise<void> => {
    await pricingAPI.delete(`/models/${id}`);
  },
};

// ============================================================================
// DYNAMIC PRICING
// ============================================================================

export const dynamicPricingApi = {
  calculate: async (
    modelId: number,
    factors: {
      demandFactor?: number;
      competitionFactor?: number;
      seasonalityFactor?: number;
      inventoryFactor?: number;
    }
  ): Promise<{ price: number; calculation: PriceCalculation }> => {
    const response = await pricingAPI.post(`/models/${modelId}/calculate`, {
      demand_factor: factors.demandFactor ?? 1.0,
      competition_factor: factors.competitionFactor ?? 1.0,
      seasonality_factor: factors.seasonalityFactor ?? 1.0,
      inventory_factor: factors.inventoryFactor ?? 1.0,
    });
    return {
      price: response.data.calculated_price,
      calculation: mapPriceCalculation(response.data.calculation),
    };
  },

  optimize: async (productId: string, marketData?: MarketData): Promise<{
    price: number;
    factors: PriceCalculation['factors'];
    recommendation: string;
  }> => {
    const response = await pricingAPI.post(`/optimize/${productId}`, {
      market_data: marketData ? {
        high_demand: marketData.highDemand,
        low_competition: marketData.lowCompetition,
        peak_season: marketData.peakSeason,
        low_inventory: marketData.lowInventory,
        competitor_prices: marketData.competitorPrices,
      } : undefined,
    });
    return {
      price: response.data.optimized_price,
      factors: {
        demandFactor: response.data.factors?.demand_factor ?? 1,
        competitionFactor: response.data.factors?.competition_factor ?? 1,
        seasonalityFactor: response.data.factors?.seasonality_factor ?? 1,
        inventoryFactor: response.data.factors?.inventory_factor ?? 1,
      },
      recommendation: response.data.recommendation || '',
    };
  },

  bulkOptimize: async (productIds: string[]): Promise<BulkPriceUpdate[]> => {
    const response = await pricingAPI.post('/optimize/bulk', { product_ids: productIds });
    return (response.data.updates || []).map((u: Record<string, unknown>) => ({
      productId: u.product_id as string,
      currentPrice: parseFloat(u.current_price as string) || 0,
      suggestedPrice: parseFloat(u.suggested_price as string) || 0,
      priceChange: parseFloat(u.price_change as string) || 0,
      changePercent: parseFloat(u.change_percent as string) || 0,
      reason: (u.reason as string) || '',
    }));
  },

  applyBulkUpdate: async (updates: { productId: string; newPrice: number }[]): Promise<void> => {
    await pricingAPI.post('/prices/bulk-update', {
      updates: updates.map(u => ({ product_id: u.productId, new_price: u.newPrice })),
    });
  },
};

// ============================================================================
// PRICE HISTORY
// ============================================================================

export const priceHistoryApi = {
  getAll: async (): Promise<PriceCalculation[]> => {
    const response = await pricingAPI.get('/history');
    return (response.data.price_history || []).map(mapPriceCalculation);
  },

  getForModel: async (modelId: number): Promise<PriceCalculation[]> => {
    const response = await pricingAPI.get(`/models/${modelId}/history`);
    return (response.data.price_history || []).map(mapPriceCalculation);
  },

  getForProduct: async (productId: string, days?: number): Promise<{
    date: string;
    price: number;
    basePrice: number;
  }[]> => {
    const response = await pricingAPI.get(`/history/product/${productId}`, {
      params: { days },
    });
    return (response.data.history || []).map((h: Record<string, unknown>) => ({
      date: h.date as string,
      price: parseFloat(h.price as string) || 0,
      basePrice: parseFloat(h.base_price as string) || 0,
    }));
  },
};

// ============================================================================
// OPTIMIZATION RULES
// ============================================================================

export const optimizationRulesApi = {
  list: async (): Promise<OptimizationRule[]> => {
    const response = await pricingAPI.get('/rules');
    return (response.data.optimization_rules || []).map(mapOptimizationRule);
  },

  get: async (id: number): Promise<OptimizationRule> => {
    const response = await pricingAPI.get(`/rules/${id}`);
    return mapOptimizationRule(response.data.rule);
  },

  create: async (data: {
    name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    priority?: number;
  }): Promise<OptimizationRule> => {
    const response = await pricingAPI.post('/rules', {
      name: data.name,
      conditions: data.conditions,
      actions: data.actions,
      priority: data.priority ?? 0,
    });
    return mapOptimizationRule(response.data.rule);
  },

  update: async (id: number, data: Partial<{
    name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    status: 'active' | 'inactive';
    priority: number;
  }>): Promise<OptimizationRule> => {
    const response = await pricingAPI.patch(`/rules/${id}`, data);
    return mapOptimizationRule(response.data.rule);
  },

  delete: async (id: number): Promise<void> => {
    await pricingAPI.delete(`/rules/${id}`);
  },

  applyRules: async (modelId: number): Promise<{ appliedRules: OptimizationRule[]; newPrice: number }> => {
    const response = await pricingAPI.post(`/models/${modelId}/apply-rules`);
    return {
      appliedRules: (response.data.applied_rules || []).map(mapOptimizationRule),
      newPrice: response.data.new_price || 0,
    };
  },
};

// ============================================================================
// STATISTICS
// ============================================================================

export const pricingStatsApi = {
  getOverview: async (): Promise<PricingStats> => {
    const response = await pricingAPI.get('/stats');
    return {
      totalPricingModels: response.data.total_pricing_models || 0,
      activePricingModels: response.data.active_pricing_models || 0,
      totalOptimizationRules: response.data.total_optimization_rules || 0,
      activeOptimizationRules: response.data.active_optimization_rules || 0,
      totalPriceCalculations: response.data.total_price_calculations || 0,
      averagePriceChange: response.data.average_price_change || 0,
    };
  },

  getMarginAnalysis: async (): Promise<{
    avgMargin: number;
    marginByCategory: { category: string; margin: number }[];
    lowMarginProducts: { productId: string; name: string; margin: number }[];
  }> => {
    const response = await pricingAPI.get('/stats/margins');
    return {
      avgMargin: response.data.avg_margin || 0,
      marginByCategory: response.data.margin_by_category || [],
      lowMarginProducts: response.data.low_margin_products || [],
    };
  },
};

// ============================================================================
// PRODUCTS (for selection)
// ============================================================================

export const productsApi = {
  list: async (search?: string): Promise<{ id: string; name: string; sku: string; price: number; cost: number }[]> => {
    const response = await inventoryAPI.get('/products', { params: { search, limit: 100 } });
    return (response.data.products || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string,
      price: parseFloat(p.selling_price as string) || parseFloat(p.price as string) || 0,
      cost: parseFloat(p.cost_price as string) || parseFloat(p.cost as string) || 0,
    }));
  },
};

// ============================================================================
// MAPPERS
// ============================================================================

function mapPricingModel(m: Record<string, unknown>): PricingModel {
  const params = (m.model_parameters || {}) as Record<string, unknown>;
  return {
    id: m.id as number,
    productId: m.product_id as string,
    productName: m.product_name as string | undefined,
    basePrice: parseFloat(m.base_price as string) || 0,
    modelName: m.model_name as string,
    modelParameters: {
      demandWeight: parseFloat(params.demand_weight as string) || 0.25,
      competitionWeight: parseFloat(params.competition_weight as string) || 0.25,
      seasonalityWeight: parseFloat(params.seasonality_weight as string) || 0.25,
      inventoryWeight: parseFloat(params.inventory_weight as string) || 0.25,
    },
    status: (m.status as PricingModel['status']) || 'active',
    createdDate: m.created_date as string,
    updatedDate: m.updated_date as string | undefined,
  };
}

function mapPriceCalculation(c: Record<string, unknown>): PriceCalculation {
  const factors = (c.factors || {}) as Record<string, unknown>;
  return {
    id: c.id as number,
    modelId: c.model_id as number,
    basePrice: parseFloat(c.base_price as string) || 0,
    calculatedPrice: parseFloat(c.calculated_price as string) || 0,
    factors: {
      demandFactor: parseFloat(factors.demand_factor as string) || 1,
      competitionFactor: parseFloat(factors.competition_factor as string) || 1,
      seasonalityFactor: parseFloat(factors.seasonality_factor as string) || 1,
      inventoryFactor: parseFloat(factors.inventory_factor as string) || 1,
    },
    calculationDate: c.calculation_date as string,
  };
}

function mapOptimizationRule(r: Record<string, unknown>): OptimizationRule {
  return {
    id: r.id as number,
    name: r.name as string,
    conditions: (r.conditions || []) as RuleCondition[],
    actions: (r.actions || []) as RuleAction[],
    status: (r.status as OptimizationRule['status']) || 'active',
    priority: (r.priority as number) || 0,
    createdDate: r.created_date as string,
  };
}
