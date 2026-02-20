import { createAPIClient } from '../../../../shared/utils/api';
const taxAPI = createAPIClient('tax');

export interface TaxDashboard {
  ytdTax: number;
  ytdInvoices: number;
  quarterTax: number;
  pendingTax: number;
  currentQuarter: number;
  currentYear: number;
}

export interface TaxSummary {
  subtotal: number;
  tax: number;
  total: number;
  count: number;
}

export interface TaxByRate {
  taxRate: number;
  taxAmount: number;
}

export interface MonthlyTax {
  month: number;
  subtotal: number;
  tax: number;
  total: number;
  invoiceCount: number;
}

export interface QuarterlyTax {
  quarter: number;
  subtotal: number;
  tax: number;
  total: number;
  invoiceCount: number;
}

export interface TaxLiability {
  collected: number;
  pending: number;
  totalLiability: number;
}

export interface TaxExportData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  customerId: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
}

export const taxApi = {
  getDashboard: async (): Promise<TaxDashboard> => {
    const response = await taxAPI.get('/dashboard');
    const d = response.data;
    return {
      ytdTax: d.ytd_tax || 0,
      ytdInvoices: d.ytd_invoices || 0,
      quarterTax: d.quarter_tax || 0,
      pendingTax: d.pending_tax || 0,
      currentQuarter: d.current_quarter || 1,
      currentYear: d.current_year || new Date().getFullYear(),
    };
  },

  getSummary: async (from: Date, to: Date, includeUnpaid?: boolean): Promise<{ from: Date; to: Date; summary: TaxSummary }> => {
    const response = await taxAPI.get('/tax/summary', { 
      params: { from: from.toISOString(), to: to.toISOString(), include_unpaid: includeUnpaid } 
    });
    const s = response.data.summary || {};
    return {
      from: new Date(response.data.from),
      to: new Date(response.data.to),
      summary: {
        subtotal: parseFloat(s.subtotal) || 0,
        tax: parseFloat(s.tax) || 0,
        total: parseFloat(s.total) || 0,
        count: s.count || 0,
      },
    };
  },

  getByRate: async (from: Date, to: Date, includeUnpaid?: boolean): Promise<TaxByRate[]> => {
    const response = await taxAPI.get('/tax/by_rate', { 
      params: { from: from.toISOString(), to: to.toISOString(), include_unpaid: includeUnpaid } 
    });
    return (response.data.by_rate || []).map((r: Record<string, unknown>) => ({
      taxRate: parseFloat(r.tax_rate as string) || 0,
      taxAmount: parseFloat(r.tax_amount as string) || 0,
    }));
  },

  getMonthly: async (year?: number): Promise<{ year: number; monthly: MonthlyTax[] }> => {
    const response = await taxAPI.get('/tax/monthly', { params: { year } });
    return {
      year: response.data.year,
      monthly: (response.data.monthly || []).map((m: Record<string, unknown>) => ({
        month: m.month as number,
        subtotal: parseFloat(m.subtotal as string) || 0,
        tax: parseFloat(m.tax as string) || 0,
        total: parseFloat(m.total as string) || 0,
        invoiceCount: m.invoice_count as number || 0,
      })),
    };
  },

  getQuarterly: async (year?: number): Promise<{ year: number; quarterly: QuarterlyTax[] }> => {
    const response = await taxAPI.get('/tax/quarterly', { params: { year } });
    return {
      year: response.data.year,
      quarterly: (response.data.quarterly || []).map((q: Record<string, unknown>) => ({
        quarter: q.quarter as number,
        subtotal: parseFloat(q.subtotal as string) || 0,
        tax: parseFloat(q.tax as string) || 0,
        total: parseFloat(q.total as string) || 0,
        invoiceCount: q.invoice_count as number || 0,
      })),
    };
  },

  getLiability: async (): Promise<TaxLiability> => {
    const response = await taxAPI.get('/tax/liability');
    return {
      collected: response.data.collected || 0,
      pending: response.data.pending || 0,
      totalLiability: response.data.total_liability || 0,
    };
  },

  exportData: async (from: Date, to: Date): Promise<{ count: number; totals: TaxSummary; invoices: TaxExportData[] }> => {
    const response = await taxAPI.get('/tax/export', { 
      params: { from: from.toISOString(), to: to.toISOString() } 
    });
    const t = response.data.totals || {};
    return {
      count: response.data.count || 0,
      totals: {
        subtotal: parseFloat(t.subtotal) || 0,
        tax: parseFloat(t.tax) || 0,
        total: parseFloat(t.total) || 0,
        count: response.data.count || 0,
      },
      invoices: (response.data.invoices || []).map((i: Record<string, unknown>) => ({
        invoiceNumber: i.invoice_number as string,
        issueDate: i.issue_date as string,
        dueDate: i.due_date as string,
        customerId: i.customer_id as string,
        subtotal: parseFloat(i.subtotal as string) || 0,
        tax: parseFloat(i.tax as string) || 0,
        total: parseFloat(i.total as string) || 0,
        status: i.status as string,
      })),
    };
  },
};
