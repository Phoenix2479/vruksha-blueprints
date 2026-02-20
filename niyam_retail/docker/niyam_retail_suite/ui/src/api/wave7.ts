import { hrAPI, assetsAPI, vendorFeedbackAPI } from '../../../../shared/utils/api.ts';

export const listEmployees = async () => (await hrAPI.get('/employees')).data.employees as any[];
export const createEmployee = async (payload: any) => (await hrAPI.post('/employees', payload)).data.employee as any;

export const listAssets = async () => (await assetsAPI.get('/assets')).data.assets as any[];
export const createAsset = async (payload: any) => (await assetsAPI.post('/assets', payload)).data.asset as any;
export const assignAsset = async (id: string, employee_id?: string) => (await assetsAPI.patch(`/assets/${id}/assign`, { employee_id })).data.asset as any;

export const listVendorFeedback = async () => (await vendorFeedbackAPI.get('/feedback')).data.feedback as any[];
export const createVendorFeedback = async (payload: any) => (await vendorFeedbackAPI.post('/feedback', payload)).data.feedback as any;
