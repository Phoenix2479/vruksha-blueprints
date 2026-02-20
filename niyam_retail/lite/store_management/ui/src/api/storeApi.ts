import axios from 'axios';

const STORE_API_URL = import.meta.env.VITE_STORE_API_URL || 'http://localhost:8801';

const api = axios.create({
  baseURL: STORE_API_URL,
  headers: { 'Content-Type': 'application/json' }
});

export interface Store {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  manager_id: string;
  opening_hours: string;
  status: 'active' | 'closed' | 'maintenance';
  employee_count: number;
  daily_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  store_id: string;
  store_name: string;
  employee_code: string;
  status: string;
}

export interface Shift {
  id: string;
  employee_id: string;
  employee_name: string;
  register_id: string;
  store_id: string;
  store_name: string;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  variance: number;
  status: 'active' | 'closed';
  started_at: string;
  ended_at: string;
}

export interface StoreStats {
  total_stores: number;
  open_stores: number;
  total_employees: number;
  daily_revenue: number;
}

export interface EODReport {
  date: string;
  store_id: string;
  generated_at: string;
  summary: {
    gross_sales: number;
    returns: number;
    net_sales: number;
    transaction_count: number;
    average_transaction: number;
  };
}

export const storeApi = {
  // Stores
  getStores: async (): Promise<Store[]> => {
    const { data } = await api.get('/stores');
    return data.stores || [];
  },

  getStore: async (id: string): Promise<Store> => {
    const { data } = await api.get(`/stores/${id}`);
    return data.store;
  },

  createStore: async (store: Partial<Store>): Promise<Store> => {
    const { data } = await api.post('/stores', store);
    return data.store;
  },

  updateStore: async (id: string, updates: Partial<Store>): Promise<Store> => {
    const { data } = await api.patch(`/stores/${id}`, updates);
    return data.store;
  },

  getStats: async (): Promise<StoreStats> => {
    const { data } = await api.get('/stores/stats/summary');
    return data;
  },

  // Employees
  getEmployees: async (storeId?: string): Promise<Employee[]> => {
    const params = storeId ? { store_id: storeId } : {};
    const { data } = await api.get('/employees', { params });
    return data.employees || [];
  },

  createEmployee: async (employee: Partial<Employee>): Promise<Employee> => {
    const { data } = await api.post('/employees', employee);
    return data.employee;
  },

  // Shifts
  getActiveShifts: async (storeId?: string): Promise<Shift[]> => {
    const params = storeId ? { store_id: storeId } : {};
    const { data } = await api.get('/shifts/active', { params });
    return data.shifts || [];
  },

  startShift: async (shift: { employee_id: string; register_id: string; store_id: string; opening_cash: number }): Promise<Shift> => {
    const { data } = await api.post('/shifts/start', shift);
    return data.shift;
  },

  endShift: async (shiftId: string, closing_cash: number, notes?: string): Promise<{ shift: Shift; summary: any }> => {
    const { data } = await api.post(`/shifts/${shiftId}/end`, { closing_cash, notes });
    return data;
  },

  // Cash Management
  cashDrop: async (drop: { shift_id: string; register_id: string; amount: number; bag_number?: string }): Promise<any> => {
    const { data } = await api.post('/cash/drop', drop);
    return data.drop;
  },

  cashMovement: async (movement: { shift_id: string; register_id: string; type: string; amount: number; reason?: string }): Promise<any> => {
    const { data } = await api.post('/cash/movement', movement);
    return data.movement;
  },

  // Registers
  getRegisters: async (storeId?: string): Promise<any[]> => {
    const params = storeId ? { store_id: storeId } : {};
    const { data } = await api.get('/registers', { params });
    return data.registers || [];
  },

  // Reports
  generateEODReport: async (storeId?: string, date?: string): Promise<EODReport> => {
    const { data } = await api.post('/reports/end-of-day', { store_id: storeId, date });
    return data.report;
  }
};

export default storeApi;
