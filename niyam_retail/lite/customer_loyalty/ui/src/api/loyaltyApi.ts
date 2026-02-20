// Customer Loyalty API - Real backend integration
import { loyaltyAPI } from '@/lib/api';
// TODO: Define types locally

// ============================================================================
// CUSTOMERS
// ============================================================================

export interface CustomerFilters {
  search?: string;
  tier?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CustomerListResponse {
  customers: LoyaltyMember[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LoyaltyMember extends Customer {
  loyaltyTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  totalSpent: number;
  visitCount: number;
  lastVisit?: string;
  memberSince: string;
  referralCode?: string;
  referredBy?: string;
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  dateOfBirth?: string;
  address?: Partial<Address>;
  referralCode?: string;
}

export const customerApi = {
  list: async (filters: CustomerFilters = {}): Promise<CustomerListResponse> => {
    const response = await loyaltyAPI.get('/members', { params: filters });
    return {
      customers: (response.data.members || []).map(mapMember),
      total: response.data.total || 0,
      page: response.data.page || 1,
      totalPages: response.data.total_pages || 1,
    };
  },

  get: async (id: string): Promise<LoyaltyMember> => {
    const response = await loyaltyAPI.get(`/members/${id}`);
    return mapMember(response.data.member);
  },

  create: async (data: CreateMemberRequest): Promise<LoyaltyMember> => {
    const response = await loyaltyAPI.post('/members', {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      date_of_birth: data.dateOfBirth,
      address: data.address ? {
        line1: data.address.line1,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postalCode,
        country: data.address.country,
      } : undefined,
      referral_code: data.referralCode,
    });
    return mapMember(response.data.member);
  },

  update: async (id: string, data: Partial<CreateMemberRequest>): Promise<LoyaltyMember> => {
    const response = await loyaltyAPI.patch(`/members/${id}`, {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      date_of_birth: data.dateOfBirth,
      address: data.address ? {
        line1: data.address.line1,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postalCode,
        country: data.address.country,
      } : undefined,
    });
    return mapMember(response.data.member);
  },

  delete: async (id: string): Promise<void> => {
    await loyaltyAPI.delete(`/members/${id}`);
  },

  searchByPhone: async (phone: string): Promise<LoyaltyMember | null> => {
    const response = await loyaltyAPI.get('/members/search', { params: { phone } });
    return response.data.member ? mapMember(response.data.member) : null;
  },

  searchByEmail: async (email: string): Promise<LoyaltyMember | null> => {
    const response = await loyaltyAPI.get('/members/search', { params: { email } });
    return response.data.member ? mapMember(response.data.member) : null;
  },
};

// ============================================================================
// POINTS
// ============================================================================

export interface PointsAdjustment {
  memberId: string;
  points: number;
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  reason: string;
  referenceType?: 'transaction' | 'reward' | 'manual' | 'referral';
  referenceId?: string;
}

export const pointsApi = {
  getBalance: async (memberId: string): Promise<{ available: number; pending: number; lifetime: number }> => {
    const response = await loyaltyAPI.get(`/members/${memberId}/points`);
    return {
      available: response.data.available || 0,
      pending: response.data.pending || 0,
      lifetime: response.data.lifetime || 0,
    };
  },

  adjust: async (data: PointsAdjustment): Promise<{ newBalance: number }> => {
    const response = await loyaltyAPI.post(`/members/${data.memberId}/points`, {
      points: data.points,
      type: data.type,
      reason: data.reason,
      reference_type: data.referenceType,
      reference_id: data.referenceId,
    });
    return { newBalance: response.data.new_balance || 0 };
  },

  getHistory: async (memberId: string, limit = 50): Promise<LoyaltyTransaction[]> => {
    const response = await loyaltyAPI.get(`/members/${memberId}/points/history`, { params: { limit } });
    return (response.data.transactions || []).map(mapTransaction);
  },

  earnFromPurchase: async (memberId: string, transactionId: string, amount: number): Promise<{ pointsEarned: number }> => {
    const response = await loyaltyAPI.post(`/members/${memberId}/points/earn`, {
      transaction_id: transactionId,
      amount,
    });
    return { pointsEarned: response.data.points_earned || 0 };
  },

  redeem: async (memberId: string, points: number, rewardId?: string): Promise<{ success: boolean; newBalance: number }> => {
    const response = await loyaltyAPI.post(`/members/${memberId}/points/redeem`, {
      points,
      reward_id: rewardId,
    });
    return {
      success: response.data.success,
      newBalance: response.data.new_balance || 0,
    };
  },
};

// ============================================================================
// REWARDS
// ============================================================================

export interface CreateRewardRequest {
  name: string;
  description?: string;
  pointsCost: number;
  type: 'discount' | 'product' | 'service' | 'voucher';
  discountAmount?: number;
  discountPercent?: number;
  productId?: string;
  isActive?: boolean;
  validFrom?: string;
  validUntil?: string;
  minTier?: string;
  maxRedemptions?: number;
}

export const rewardsApi = {
  list: async (): Promise<LoyaltyReward[]> => {
    const response = await loyaltyAPI.get('/rewards');
    return (response.data.rewards || []).map(mapReward);
  },

  get: async (id: string): Promise<LoyaltyReward> => {
    const response = await loyaltyAPI.get(`/rewards/${id}`);
    return mapReward(response.data.reward);
  },

  create: async (data: CreateRewardRequest): Promise<LoyaltyReward> => {
    const response = await loyaltyAPI.post('/rewards', {
      name: data.name,
      description: data.description,
      points_cost: data.pointsCost,
      type: data.type,
      discount_amount: data.discountAmount,
      discount_percent: data.discountPercent,
      product_id: data.productId,
      is_active: data.isActive ?? true,
      valid_from: data.validFrom,
      valid_until: data.validUntil,
      min_tier: data.minTier,
      max_redemptions: data.maxRedemptions,
    });
    return mapReward(response.data.reward);
  },

  update: async (id: string, data: Partial<CreateRewardRequest>): Promise<LoyaltyReward> => {
    const response = await loyaltyAPI.patch(`/rewards/${id}`, {
      name: data.name,
      description: data.description,
      points_cost: data.pointsCost,
      type: data.type,
      discount_amount: data.discountAmount,
      discount_percent: data.discountPercent,
      is_active: data.isActive,
      valid_from: data.validFrom,
      valid_until: data.validUntil,
      min_tier: data.minTier,
      max_redemptions: data.maxRedemptions,
    });
    return mapReward(response.data.reward);
  },

  delete: async (id: string): Promise<void> => {
    await loyaltyAPI.delete(`/rewards/${id}`);
  },

  getAvailableForMember: async (memberId: string): Promise<LoyaltyReward[]> => {
    const response = await loyaltyAPI.get(`/members/${memberId}/available-rewards`);
    return (response.data.rewards || []).map(mapReward);
  },
};

// ============================================================================
// TIERS
// ============================================================================

export interface LoyaltyTier {
  id: string;
  name: string;
  code: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  minPoints: number;
  maxPoints?: number;
  earnMultiplier: number;
  discountPercent: number;
  benefits: string[];
  color: string;
}

export const tiersApi = {
  list: async (): Promise<LoyaltyTier[]> => {
    const response = await loyaltyAPI.get('/tiers');
    return (response.data.tiers || []).map(mapTier);
  },

  getMemberTier: async (memberId: string): Promise<LoyaltyTier> => {
    const response = await loyaltyAPI.get(`/members/${memberId}/tier`);
    return mapTier(response.data.tier);
  },
};

// ============================================================================
// STATS
// ============================================================================

export interface LoyaltyStats {
  totalMembers: number;
  activeMembersLast30Days: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  membersByTier: Record<string, number>;
  avgPointsPerMember: number;
  redemptionRate: number;
  topMembers: LoyaltyMember[];
}

export const statsApi = {
  getOverview: async (): Promise<LoyaltyStats> => {
    const response = await loyaltyAPI.get('/stats/overview');
    return {
      totalMembers: response.data.total_members || 0,
      activeMembersLast30Days: response.data.active_members_30d || 0,
      totalPointsIssued: response.data.total_points_issued || 0,
      totalPointsRedeemed: response.data.total_points_redeemed || 0,
      membersByTier: response.data.members_by_tier || {},
      avgPointsPerMember: response.data.avg_points_per_member || 0,
      redemptionRate: response.data.redemption_rate || 0,
      topMembers: (response.data.top_members || []).map(mapMember),
    };
  },

  getTierBreakdown: async (): Promise<{ tier: string; count: number; percentage: number }[]> => {
    const response = await loyaltyAPI.get('/stats/tiers');
    return response.data.breakdown || [];
  },

  getPointsActivity: async (days = 30): Promise<{ date: string; earned: number; redeemed: number }[]> => {
    const response = await loyaltyAPI.get('/stats/points-activity', { params: { days } });
    return response.data.activity || [];
  },
};

// ============================================================================
// CAMPAIGNS
// ============================================================================

export interface LoyaltyCampaign {
  id: string;
  name: string;
  description?: string;
  type: 'bonus_points' | 'double_points' | 'tier_upgrade' | 'special_offer';
  multiplier?: number;
  bonusPoints?: number;
  startDate: string;
  endDate: string;
  targetTiers?: string[];
  isActive: boolean;
}

export const campaignsApi = {
  list: async (): Promise<LoyaltyCampaign[]> => {
    const response = await loyaltyAPI.get('/campaigns');
    return (response.data.campaigns || []).map(mapCampaign);
  },

  getActive: async (): Promise<LoyaltyCampaign[]> => {
    const response = await loyaltyAPI.get('/campaigns/active');
    return (response.data.campaigns || []).map(mapCampaign);
  },

  create: async (data: Omit<LoyaltyCampaign, 'id'>): Promise<LoyaltyCampaign> => {
    const response = await loyaltyAPI.post('/campaigns', {
      name: data.name,
      description: data.description,
      type: data.type,
      multiplier: data.multiplier,
      bonus_points: data.bonusPoints,
      start_date: data.startDate,
      end_date: data.endDate,
      target_tiers: data.targetTiers,
      is_active: data.isActive,
    });
    return mapCampaign(response.data.campaign);
  },
};

// ============================================================================
// MAPPERS
// ============================================================================

function mapMember(m: any): LoyaltyMember {
  return {
    id: m.id,
    customerNumber: m.customer_number || m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    email: m.email,
    phone: m.phone,
    dateOfBirth: m.date_of_birth,
    gender: m.gender,
    address: m.address ? {
      line1: m.address.line1 || m.address,
      city: m.address.city || m.city,
      state: m.address.state || m.state,
      postalCode: m.address.postal_code || m.postal_code,
      country: m.address.country || m.country || 'IN',
    } : undefined,
    loyaltyTier: m.loyalty_tier || m.tier || 'bronze',
    loyaltyPoints: parseInt(m.loyalty_points || m.points) || 0,
    lifetimePoints: parseInt(m.lifetime_points) || 0,
    lifetimeSpend: parseFloat(m.lifetime_spend || m.total_spent) || 0,
    totalSpent: parseFloat(m.total_spent) || 0,
    visitCount: parseInt(m.visit_count || m.visits) || 0,
    lastVisit: m.last_visit,
    memberSince: m.member_since || m.joined_at || m.created_at,
    referralCode: m.referral_code,
    referredBy: m.referred_by,
    creditBalance: parseFloat(m.credit_balance) || 0,
    marketingOptIn: m.marketing_opt_in ?? true,
    isActive: m.is_active ?? true,
    totalOrders: parseInt(m.total_orders) || 0,
    averageOrderValue: parseFloat(m.average_order_value) || 0,
    tags: m.tags,
    notes: m.notes,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

function mapTransaction(t: any): LoyaltyTransaction {
  return {
    id: t.id,
    customerId: t.customer_id || t.member_id,
    type: t.type,
    points: parseInt(t.points) || 0,
    balance: parseInt(t.balance || t.balance_after) || 0,
    balanceAfter: parseInt(t.balance_after || t.balance) || 0,
    description: t.description || t.reason,
    referenceType: t.reference_type,
    referenceId: t.reference_id,
    expiresAt: t.expires_at,
    createdAt: t.created_at,
  };
}

function mapReward(r: any): LoyaltyReward {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    pointsCost: parseInt(r.points_cost) || 0,
    type: r.type,
    discountAmount: r.discount_amount != null ? parseFloat(r.discount_amount) : undefined,
    discountPercent: r.discount_percent != null ? parseFloat(r.discount_percent) : undefined,
    productId: r.product_id,
    isActive: r.is_active ?? true,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    minTier: r.min_tier,
    maxRedemptions: r.max_redemptions != null ? parseInt(r.max_redemptions) : undefined,
    currentRedemptions: parseInt(r.current_redemptions) || 0,
    imageUrl: r.image_url,
  };
}

function mapTier(t: any): LoyaltyTier {
  return {
    id: t.id,
    name: t.name,
    code: t.code,
    minPoints: parseInt(t.min_points) || 0,
    maxPoints: t.max_points != null ? parseInt(t.max_points) : undefined,
    earnMultiplier: parseFloat(t.earn_multiplier) || 1,
    discountPercent: parseFloat(t.discount_percent) || 0,
    benefits: t.benefits || [],
    color: t.color || '#888888',
  };
}

function mapCampaign(c: any): LoyaltyCampaign {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    multiplier: c.multiplier != null ? parseFloat(c.multiplier) : undefined,
    bonusPoints: c.bonus_points != null ? parseInt(c.bonus_points) : undefined,
    startDate: c.start_date,
    endDate: c.end_date,
    targetTiers: c.target_tiers,
    isActive: c.is_active ?? true,
  };
}
