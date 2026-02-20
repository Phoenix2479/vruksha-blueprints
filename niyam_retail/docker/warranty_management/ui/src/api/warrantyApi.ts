import { createAPIClient } from '../../../../shared/utils/api';

const warrantyAPI = createAPIClient('warranty');

export interface WarrantyClaim {
  id: number;
  claimNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  productId: string;
  productName: string;
  productSku: string;
  serialNumber?: string;
  purchaseDate: string;
  warrantyEndDate: string;
  issueType: 'defect' | 'damage' | 'malfunction' | 'missing_parts' | 'other';
  issueDescription: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'in_repair' | 'completed' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  resolution?: 'repair' | 'replace' | 'refund' | 'rejected';
  resolutionNotes?: string;
  assignedTo?: string;
  attachments?: string[];
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface WarrantyPolicy {
  id: number;
  name: string;
  description: string;
  durationMonths: number;
  coverageType: 'full' | 'limited' | 'extended';
  coveredIssues: string[];
  exclusions: string[];
  terms: string;
  isActive: boolean;
  createdAt: string;
}

export interface WarrantyRegistration {
  id: number;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyPolicyId: number;
  warrantyPolicyName: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  status: 'active' | 'expired' | 'voided';
  registeredAt: string;
}

export interface WarrantyStats {
  totalClaims: number;
  pendingClaims: number;
  inProgressClaims: number;
  completedClaims: number;
  avgResolutionDays: number;
  approvalRate: number;
  activeRegistrations: number;
  expiringThisMonth: number;
}

const mapClaim = (c: Record<string, unknown>): WarrantyClaim => ({
  id: c.id as number,
  claimNumber: c.claim_number as string || `WC-${c.id}`,
  customerId: c.customer_id as string,
  customerName: c.customer_name as string,
  customerEmail: c.customer_email as string,
  customerPhone: c.customer_phone as string,
  productId: c.product_id as string,
  productName: c.product_name as string,
  productSku: c.product_sku as string || '',
  serialNumber: c.serial_number as string,
  purchaseDate: c.purchase_date as string,
  warrantyEndDate: c.warranty_end_date as string,
  issueType: c.issue_type as WarrantyClaim['issueType'] || 'other',
  issueDescription: c.issue_description as string || '',
  status: c.status as WarrantyClaim['status'] || 'pending',
  priority: c.priority as WarrantyClaim['priority'] || 'medium',
  resolution: c.resolution as WarrantyClaim['resolution'],
  resolutionNotes: c.resolution_notes as string,
  assignedTo: c.assigned_to as string,
  attachments: c.attachments as string[],
  createdAt: c.created_at as string || new Date().toISOString(),
  updatedAt: c.updated_at as string,
  completedAt: c.completed_at as string,
});

const mapPolicy = (p: Record<string, unknown>): WarrantyPolicy => ({
  id: p.id as number,
  name: p.name as string,
  description: p.description as string || '',
  durationMonths: p.duration_months as number || 12,
  coverageType: p.coverage_type as WarrantyPolicy['coverageType'] || 'limited',
  coveredIssues: (p.covered_issues as string[]) || [],
  exclusions: (p.exclusions as string[]) || [],
  terms: p.terms as string || '',
  isActive: p.is_active as boolean ?? true,
  createdAt: p.created_at as string || new Date().toISOString(),
});

const mapRegistration = (r: Record<string, unknown>): WarrantyRegistration => ({
  id: r.id as number,
  customerId: r.customer_id as string,
  customerName: r.customer_name as string,
  productId: r.product_id as string,
  productName: r.product_name as string,
  serialNumber: r.serial_number as string,
  purchaseDate: r.purchase_date as string,
  warrantyPolicyId: r.warranty_policy_id as number,
  warrantyPolicyName: r.warranty_policy_name as string,
  warrantyStartDate: r.warranty_start_date as string,
  warrantyEndDate: r.warranty_end_date as string,
  status: r.status as WarrantyRegistration['status'] || 'active',
  registeredAt: r.registered_at as string || new Date().toISOString(),
});

export const claimsApi = {
  list: async (params?: { status?: WarrantyClaim['status']; priority?: WarrantyClaim['priority'] }): Promise<WarrantyClaim[]> => {
    const response = await warrantyAPI.get('/claims', { params });
    return (response.data.claims || []).map(mapClaim);
  },
  get: async (id: number): Promise<WarrantyClaim> => {
    const response = await warrantyAPI.get(`/claims/${id}`);
    return mapClaim(response.data.claim);
  },
  create: async (data: {
    customerId: string;
    productId: string;
    serialNumber?: string;
    purchaseDate: string;
    issueType: WarrantyClaim['issueType'];
    issueDescription: string;
    priority?: WarrantyClaim['priority'];
  }): Promise<WarrantyClaim> => {
    const response = await warrantyAPI.post('/claims', {
      customer_id: data.customerId,
      product_id: data.productId,
      serial_number: data.serialNumber,
      purchase_date: data.purchaseDate,
      issue_type: data.issueType,
      issue_description: data.issueDescription,
      priority: data.priority || 'medium',
    });
    return mapClaim(response.data.claim);
  },
  update: async (id: number, data: {
    status?: WarrantyClaim['status'];
    priority?: WarrantyClaim['priority'];
    resolution?: WarrantyClaim['resolution'];
    resolutionNotes?: string;
    assignedTo?: string;
  }): Promise<WarrantyClaim> => {
    const response = await warrantyAPI.put(`/claims/${id}`, {
      status: data.status,
      priority: data.priority,
      resolution: data.resolution,
      resolution_notes: data.resolutionNotes,
      assigned_to: data.assignedTo,
    });
    return mapClaim(response.data.claim);
  },
  delete: async (id: number): Promise<void> => {
    await warrantyAPI.delete(`/claims/${id}`);
  },
  getStats: async (): Promise<WarrantyStats> => {
    const response = await warrantyAPI.get('/claims/stats');
    const s = response.data;
    return {
      totalClaims: s.total_claims || 0,
      pendingClaims: s.pending_claims || 0,
      inProgressClaims: s.in_progress_claims || 0,
      completedClaims: s.completed_claims || 0,
      avgResolutionDays: parseFloat(s.avg_resolution_days) || 0,
      approvalRate: parseFloat(s.approval_rate) || 0,
      activeRegistrations: s.active_registrations || 0,
      expiringThisMonth: s.expiring_this_month || 0,
    };
  },
};

export const policiesApi = {
  list: async (): Promise<WarrantyPolicy[]> => {
    const response = await warrantyAPI.get('/policies');
    return (response.data.policies || []).map(mapPolicy);
  },
  get: async (id: number): Promise<WarrantyPolicy> => {
    const response = await warrantyAPI.get(`/policies/${id}`);
    return mapPolicy(response.data.policy);
  },
  create: async (data: {
    name: string;
    description: string;
    durationMonths: number;
    coverageType: WarrantyPolicy['coverageType'];
    coveredIssues: string[];
    exclusions?: string[];
    terms?: string;
  }): Promise<WarrantyPolicy> => {
    const response = await warrantyAPI.post('/policies', {
      name: data.name,
      description: data.description,
      duration_months: data.durationMonths,
      coverage_type: data.coverageType,
      covered_issues: data.coveredIssues,
      exclusions: data.exclusions,
      terms: data.terms,
    });
    return mapPolicy(response.data.policy);
  },
  delete: async (id: number): Promise<void> => {
    await warrantyAPI.delete(`/policies/${id}`);
  },
};

export const registrationsApi = {
  list: async (params?: { status?: WarrantyRegistration['status']; customerId?: string }): Promise<WarrantyRegistration[]> => {
    const response = await warrantyAPI.get('/registrations', { params });
    return (response.data.registrations || []).map(mapRegistration);
  },
  create: async (data: {
    customerId: string;
    productId: string;
    serialNumber: string;
    purchaseDate: string;
    warrantyPolicyId: number;
  }): Promise<WarrantyRegistration> => {
    const response = await warrantyAPI.post('/registrations', {
      customer_id: data.customerId,
      product_id: data.productId,
      serial_number: data.serialNumber,
      purchase_date: data.purchaseDate,
      warranty_policy_id: data.warrantyPolicyId,
    });
    return mapRegistration(response.data.registration);
  },
  checkValidity: async (serialNumber: string): Promise<{ valid: boolean; registration?: WarrantyRegistration; daysRemaining?: number }> => {
    const response = await warrantyAPI.get(`/registrations/check/${serialNumber}`);
    return {
      valid: response.data.valid,
      registration: response.data.registration ? mapRegistration(response.data.registration) : undefined,
      daysRemaining: response.data.days_remaining,
    };
  },
};
