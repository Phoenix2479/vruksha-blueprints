import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const getVoucherTypes = () => api.get('/voucher-types').then(r => r.data.data);
export const getVouchers = (params?: Record<string, string>) => api.get('/vouchers', { params }).then(r => r.data.data);
export const getVoucher = (id: string) => api.get(`/vouchers/${id}`).then(r => r.data.data);
export const createVoucher = (data: any) => api.post('/vouchers', data).then(r => r.data.data);
export const postVoucher = (id: string) => api.post(`/vouchers/${id}/post`).then(r => r.data);
export const voidVoucher = (id: string) => api.post(`/vouchers/${id}/void`).then(r => r.data);

export const getAccounts = (params?: Record<string, string>) => api.get('/accounts', { params }).then(r => r.data.data);
export const getParties = () => api.get('/parties').then(r => r.data.data);

export const getRecurring = () => api.get('/recurring').then(r => r.data.data);
export const getRecurringDetail = (id: string) => api.get(`/recurring/${id}`).then(r => r.data.data);
export const createRecurring = (data: any) => api.post('/recurring', data).then(r => r.data.data);
export const updateRecurring = (id: string, data: any) => api.put(`/recurring/${id}`, data).then(r => r.data.data);
export const deleteRecurring = (id: string) => api.delete(`/recurring/${id}`).then(r => r.data);
export const pauseRecurring = (id: string) => api.post(`/recurring/${id}/pause`).then(r => r.data.data);
export const runRecurring = () => api.post('/recurring/run').then(r => r.data.data);
export const getRecurringHistory = (id: string) => api.get(`/recurring/${id}/history`).then(r => r.data.data);
