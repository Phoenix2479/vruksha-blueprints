// Unified CRM360 Types

// Customer Segments
export type CustomerSegment = 'vip' | 'loyal' | 'regular' | 'new' | 'at_risk';
export type ContactSegment = 'lead' | 'prospect' | 'customer' | 'vip' | 'churned';
export type DealStage = 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task' | 'purchase' | 'return' | 'inquiry' | 'feedback';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

// Customer/Contact Profile
export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  segment: CustomerSegment | ContactSegment;
  lifetimeValue: number;
  totalOrders: number;
  avgOrderValue: number;
  lastOrderDate?: string;
  memberSince: string;
  preferences?: string[];
  tags?: string[];
  address?: string;
  notes?: string;
  status?: string;
  source?: string;
  avatar?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Deal
export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: DealStage;
  probability: number;
  customerId: string;
  customer?: CustomerProfile;
  expectedCloseDate?: string;
  assignedTo?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Activity
export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  customerId?: string;
  dealId?: string;
  customer?: CustomerProfile;
  deal?: Deal;
  dueDate?: string;
  completedAt?: string;
  priority: Priority;
  assignedTo?: string;
  createdAt: string;
  value?: number;
}

// Stats
export interface CustomerStats {
  totalCustomers: number;
  vip: number;
  atRisk: number;
  avgLifetimeValue: number;
}

export interface CRMStats {
  totalCustomers: number;
  newLeads: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonDeals: number;
  wonValue: number;
  conversionRate: number;
  avgDealSize: number;
  vip: number;
  atRisk: number;
  avgLifetimeValue: number;
}

export interface PipelineStats {
  stage: DealStage;
  count: number;
  value: number;
}

// Filters
export interface CustomerFilters {
  segment?: CustomerSegment | ContactSegment | string;
  search?: string;
  tags?: string[];
}

export interface DealFilters {
  stage?: DealStage;
  search?: string;
  customerId?: string;
  minValue?: number;
  maxValue?: number;
}

export interface ActivityFilters {
  customerId?: string;
  dealId?: string;
  type?: ActivityType;
}

// AI Actions
export interface AIAction {
  id: string;
  action_type: string;
  target_id: string;
  target_type: string;
  reasoning?: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  confidence_score: number;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
  executed_at?: string;
  result?: Record<string, unknown>;
  override_reason?: string;
}

export interface AIActionsSummary {
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
}

// Consent
export interface Consent {
  type: string;
  granted: boolean;
  granted_at?: string;
  source?: string;
}

// Audit
export interface AuditEntry {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Journey
export interface JourneyEvent {
  stage: string;
  event: string;
  date: string;
  channel: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerJourney {
  customer_id: string;
  current_stage: string;
  timeline: JourneyEvent[];
  stages: string[];
  recommendations: string[];
}

// Segments
export interface Segment {
  id: string;
  name: string;
  count: number;
  percentage: string;
  color: string;
  avgLTV: number;
}

export interface SegmentationAnalysis {
  segments: Segment[];
  insights: {
    total_customers: number;
    avg_lifetime_value: number;
    recommendation: string;
  };
}
