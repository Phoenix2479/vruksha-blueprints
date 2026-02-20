import { crmAPI, loyaltyAPI, feedbackAPI, notificationsAPI, marketingAPI } from '../../../../shared/utils/api.ts';

// CRM
export const listSegments = async () => {
  const r = await crmAPI.get('/segments');
  return r.data.segments as any[];
};
export const createSegment = async (name: string, description?: string) => {
  const r = await crmAPI.post('/segments', { name, description });
  return r.data.segment as any;
};
export const listCustomers = async (search?: string) => {
  const r = await crmAPI.get('/customers', { params: { search } });
  return r.data.customers as any[];
};
export const addCustomerTags = async (customerId: string, tagNames: string[]) => {
  await crmAPI.post(`/customers/${customerId}/tags`, { tag_names: tagNames });
};

// Loyalty
export const getLoyaltySummary = async (customerId: string) => {
  const r = await loyaltyAPI.get(`/loyalty/${customerId}/summary`);
  return r.data as any;
};
export const redeemPoints = async (customerId: string, points: number, reason?: string) => {
  const r = await loyaltyAPI.post('/loyalty/redeem', { customer_id: customerId, points, reason });
  return r.data as any;
};

// Feedback
export const listFeedback = async () => {
  const r = await feedbackAPI.get('/feedback');
  return r.data.feedback as any[];
};
export const createFeedback = async (payload: { rating?: number; feedback_type?: string; comments?: string; source?: string }) => {
  const r = await feedbackAPI.post('/feedback', payload);
  return r.data.feedback as any;
};

// Notifications
export const listNotifications = async () => {
  const r = await notificationsAPI.get('/queue');
  return r.data.notifications as any[];
};
export const enqueueNotification = async (payload: { channel: 'email'|'sms'|'push'; recipient: string; payload?: any; template?: any }) => {
  const r = await notificationsAPI.post('/send', payload);
  return r.data.notification as any;
};

// Marketing
export const listCampaigns = async () => {
  const r = await marketingAPI.get('/campaigns');
  return r.data.campaigns as any[];
};
export const createCampaign = async (name: string, template?: any) => {
  const r = await marketingAPI.post('/campaigns', { name, template });
  return r.data.campaign as any;
};
export const runCampaign = async (campaignId: string) => {
  const r = await marketingAPI.post(`/campaigns/${campaignId}/run`, {});
  return r.data.run as any;
};
