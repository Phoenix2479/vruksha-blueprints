import { createAPIClient } from '../../../../shared/utils/api';

const feedbackAPI = createAPIClient('feedback');

export interface Feedback {
  id: number;
  customerId: string;
  customerName: string;
  type: 'review' | 'complaint' | 'suggestion' | 'compliment' | 'inquiry';
  channel: 'in-store' | 'online' | 'phone' | 'email' | 'social' | 'app';
  rating?: number;
  title?: string;
  content: string;
  productId?: string;
  productName?: string;
  orderId?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  status: 'new' | 'in_review' | 'responded' | 'resolved' | 'archived';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;
  response?: string;
  respondedAt?: string;
  tags: string[];
  createdAt: string;
}

export interface FeedbackStats {
  totalFeedback: number;
  newFeedback: number;
  avgRating: number;
  nps: number;
  positivePercent: number;
  negativePercent: number;
  responseRate: number;
  avgResponseTime: number;
}

export interface SentimentTrend {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

const mapFeedback = (f: Record<string, unknown>): Feedback => ({
  id: f.id as number,
  customerId: f.customer_id as string,
  customerName: f.customer_name as string,
  type: f.type as Feedback['type'] || 'review',
  channel: f.channel as Feedback['channel'] || 'online',
  rating: f.rating as number,
  title: f.title as string,
  content: f.content as string || '',
  productId: f.product_id as string,
  productName: f.product_name as string,
  orderId: f.order_id as string,
  sentiment: f.sentiment as Feedback['sentiment'] || 'neutral',
  sentimentScore: parseFloat(f.sentiment_score as string) || 0,
  status: f.status as Feedback['status'] || 'new',
  priority: f.priority as Feedback['priority'] || 'medium',
  assignedTo: f.assigned_to as string,
  response: f.response as string,
  respondedAt: f.responded_at as string,
  tags: (f.tags as string[]) || [],
  createdAt: f.created_at as string || new Date().toISOString(),
});

export const feedbackApi = {
  list: async (params?: { status?: Feedback['status']; type?: Feedback['type']; sentiment?: Feedback['sentiment'] }): Promise<Feedback[]> => {
    const response = await feedbackAPI.get('/feedback', { params });
    return (response.data.feedback || []).map(mapFeedback);
  },
  get: async (id: number): Promise<Feedback> => {
    const response = await feedbackAPI.get(`/feedback/${id}`);
    return mapFeedback(response.data.feedback);
  },
  respond: async (id: number, response: string): Promise<Feedback> => {
    const res = await feedbackAPI.post(`/feedback/${id}/respond`, { response });
    return mapFeedback(res.data.feedback);
  },
  updateStatus: async (id: number, status: Feedback['status']): Promise<Feedback> => {
    const response = await feedbackAPI.put(`/feedback/${id}/status`, { status });
    return mapFeedback(response.data.feedback);
  },
  delete: async (id: number): Promise<void> => {
    await feedbackAPI.delete(`/feedback/${id}`);
  },
  getStats: async (): Promise<FeedbackStats> => {
    const response = await feedbackAPI.get('/feedback/stats');
    const s = response.data;
    return {
      totalFeedback: s.total_feedback || 0,
      newFeedback: s.new_feedback || 0,
      avgRating: parseFloat(s.avg_rating) || 0,
      nps: parseFloat(s.nps) || 0,
      positivePercent: parseFloat(s.positive_percent) || 0,
      negativePercent: parseFloat(s.negative_percent) || 0,
      responseRate: parseFloat(s.response_rate) || 0,
      avgResponseTime: parseFloat(s.avg_response_time) || 0,
    };
  },
  getSentimentTrends: async (days?: number): Promise<SentimentTrend[]> => {
    const response = await feedbackAPI.get('/feedback/sentiment-trends', { params: { days } });
    return (response.data.trends || []).map((t: Record<string, unknown>) => ({
      date: t.date as string,
      positive: t.positive as number || 0,
      neutral: t.neutral as number || 0,
      negative: t.negative as number || 0,
    }));
  },
};
