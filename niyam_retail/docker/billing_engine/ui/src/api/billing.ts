import { billingAPI, inventoryAPI } from '@shared/utils/api.ts';
import type { Invoice, Payment } from '@shared/types/models.ts';

// Invoices
export const getInvoices = async (params?: {
  status?: string;
  customer_id?: string;
  from_date?: string;
  to_date?: string;
}): Promise<Invoice[]> => {
  const response = await billingAPI.get('/invoices', { params });
  return response.data.invoices || [];
};

export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  const response = await billingAPI.get(`/invoices/${invoiceId}`);
  return response.data.invoice;
};

export const createInvoice = async (data: {
  customer_id: string;
  due_date: string;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }>;
  notes?: string;
}): Promise<Invoice> => {
  const isUuid = (v: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
  const payload = {
    ...data,
    items: data.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price: item.unit_price,
      tax_rate: item.tax_rate,
    })),
  };

  // If customer_id is free-form text (not a UUID), move it to customer_name
  if (payload.customer_id && !isUuid(payload.customer_id)) {
    (payload as any).customer_name = payload.customer_id;
    delete (payload as any).customer_id;
  }

  const response = await billingAPI.post('/invoices', payload);
  return response.data.invoice;
};

export const updateInvoice = async (invoiceId: string, data: Partial<Invoice>): Promise<Invoice> => {
  const response = await billingAPI.patch(`/invoices/${invoiceId}`, data);
  return response.data.invoice;
};

export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  await billingAPI.delete(`/invoices/${invoiceId}`);
};

// Payments
export const recordPayment = async (data: {
  invoice_id: string;
  amount: number;
  payment_method: string;
  payment_date?: string;
  reference?: string;
}): Promise<Payment> => {
  const { invoice_id, amount, payment_method, payment_date, reference } = data;

  const response = await billingAPI.post(`/invoices/${invoice_id}/payments`, {
    amount,
    payment_method,
    transaction_ref: reference,
    notes: payment_date ? `Payment for invoice on ${payment_date}` : undefined,
  });

  return response.data.payment;
};

export const getPayments = async (invoiceId: string): Promise<Payment[]> => {
  const response = await billingAPI.get(`/invoices/${invoiceId}/payments`);
  return response.data.payments || [];
};

// Statistics
export const getRevenueStats = async (params?: {
  from_date?: string;
  to_date?: string;
}): Promise<{ total_revenue: number; pending_amount: number; overdue_amount: number }> => {
  const queryParams = params
    ? {
        start_date: params.from_date,
        end_date: params.to_date,
      }
    : undefined;

  const response = await billingAPI.get('/revenue/summary', { params: queryParams });
  const summary = response.data.revenue_summary || {};

  return {
    total_revenue: summary.total_revenue ?? 0,
    pending_amount: summary.pending_amount ?? 0,
    overdue_amount: summary.overdue_amount ?? 0,
  };
};

// Product search (from Inventory service) for invoice item entry
export const searchProducts = async (query: string): Promise<Array<{
  id: string;
  name: string;
  sku: string;
  price: number;
  tax_rate: number;
  in_stock: boolean;
}>> => {
  if (!query || query.trim().length < 2) return [];
  const response = await inventoryAPI.get('/products', { params: { search: query } });
  const products = response.data.products || [];
  return products.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.unit_price,
    tax_rate: p.tax_rate,
    in_stock: (p.quantity_on_hand ?? 0) > 0,
  }));
};
